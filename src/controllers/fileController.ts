import { Request, Response } from "express";
import fs from "fs";
import mammoth from "mammoth";
import prisma from "../config/prisma";
import { PDFParse } from "pdf-parse";
import { uploader } from "../config/multer";
import { saveScore } from "../services/scoreService";
import { ScoringEngine } from "../services/scoringEngine";
import { AIExtractionService } from "../services/aiExtractionService";
import { SubscriptionService } from "../services/subscriptionService";
import { EmbeddingService } from "../services/embeddingService";

const aiService = new AIExtractionService();
const scoringEngine = new ScoringEngine();
const subscriptionService = new SubscriptionService();
const embeddingService = new EmbeddingService();

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Free plan: limit number of uploaded files (lifetime) when no active subscription
    const subscription = await subscriptionService.getUserSubscription(userId);
    if (!subscription || subscription.status !== "active") {
      const FREE_FILE_UPLOADS = Number(process.env.FREE_FILE_UPLOADS ?? 4);
      if (FREE_FILE_UPLOADS > 0) {
        const usedUploads = await prisma.usageLog.count({
          where: { userId, usageType: "file_upload" },
        });
        if (usedUploads >= FREE_FILE_UPLOADS) {
          return res.status(403).json({
            error: "Free upload limit reached",
            message: `Free plan allows up to ${FREE_FILE_UPLOADS} uploaded files. Please upgrade your plan to upload more files.`,
            limit: FREE_FILE_UPLOADS,
            used: usedUploads,
          });
        }
      }
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const { workspaceId } = req.body;
    const filepath = await uploader(req, req.file);

    // Extract text from file
    let extractedText = "";
    try {
      if (mimetype === "application/pdf") {
        // Convert Buffer to Uint8Array as required by pdf-parse
        const uint8Array = new Uint8Array(buffer);
        const parser = new PDFParse(uint8Array);
        const result = await parser.getText();
        extractedText = result.text;
      } else if (mimetype.includes("wordprocessingml.document")) {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (mimetype === "text/plain") {
        extractedText = buffer.toString("utf-8");
      }
    } catch (extractError) {
      console.warn("Text extraction failed:", extractError);
    }

    const file = await prisma.file.create({
      data: {
        userId,
        filename: originalname,
        filetype: mimetype,
        filesize: size,
        filepath: filepath,
        extractedText: extractedText || null,
        workspaceId: workspaceId ? Number(workspaceId) : null,
      },
    });

    // Background task: Vectorize the file for RAG (non-blocking)
    if (extractedText) {
      embeddingService.processFile(file.id, extractedText).catch(err => {
        console.error(`Vectorization failed for file ${file.id}:`, err);
      });
    }

    // Log usage for free-plan lifetime counting
    await prisma.usageLog.create({
      data: {
        userId,
        usageType: "file_upload",
        fileId: file.id,
        metadata: { filename: originalname, filesize: size },
      },
    });

    res.status(201).json(file);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Server error during file upload" });
  }
};

export const getFile = async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId || "");
    if (isNaN(fileId)) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (file.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json(file);
  } catch (error) {
    console.error("Get file error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const getAllFiles = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { workspaceId } = req.query;
    const whereClause: any = { userId };

    // Explicitly check for 'undefined' string or empty string to avoid filtering if not intended
    // But if we want to filter by "No Workspace" (null), client should send specific flag?
    // For now, if workspaceId is provided, filter by it.
    if (workspaceId && workspaceId !== 'all') {
      whereClause.workspaceId = Number(workspaceId);
    }

    const subscription = await subscriptionService.getUserSubscription(userId);
    const isPro = subscription && subscription.status === "active";

    const files = await prisma.file.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    // Redact analysis content in getAllFiles for free users
    const redactedFiles = files.map((file: any) => {
      if (!isPro && file.reviews && file.reviews.length > 0) {
        const review = file.reviews[0];
        if (review && review.content) {
          try {
            const content = typeof review.content === 'string' ? JSON.parse(review.content) : review.content;

            // Check if it's the wrapped object or the raw scoring result
            if (content.scoringResult) {
              content.scoringResult = scoringEngine.redactResult(content.scoringResult);
            } else {
              // Usually the 'content' field in review table is the whole scoringResult
              // or it has been saved as the wrapped object. We try to redact as ScoringResult.
              // redactResult handles property checks internally.
              const redactedResult = scoringEngine.redactResult(content);

              if (typeof review.content === 'string') {
                review.content = JSON.stringify(redactedResult);
              } else {
                review.content = redactedResult;
              }
              return file;
            }

            if (content.extractedFacts) {
              content.extractedFacts = {
                message: "Upgrade to Pro to unlock detailed extracted contract terms."
              };
            }

            if (typeof review.content === 'string') {
              review.content = JSON.stringify(content);
            } else {
              review.content = content;
            }
          } catch (e) {
            console.error("Redaction in getAllFiles failed", e);
          }
        }
      }
      return file;
    });

    res.json(redactedFiles);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

export const analyzeFile = async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId || "");
    if (isNaN(fileId)) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const subscription = await subscriptionService.getUserSubscription(userId);
    const isPro = subscription && subscription.status === "active";

    // Verify file ownership
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!file.extractedText) {
      return res.status(400).json({ error: "File has no extracted text" });
    }

    // Extract facts using AI
    const extractedFacts = await aiService.extractFacts(fileId);

    // Score the agreement
    const scoringResult = scoringEngine.scoreAgreement(extractedFacts);

    // Save the score
    await saveScore(fileId, {
      totalScore: scoringResult.totalScore,
      metrics: scoringResult.metrics,
      flags: scoringResult.flags,
      recommendations: scoringResult.recommendations,
      grade: scoringResult.grade,
      gradeDescription: scoringResult.gradeDescription,
      findings: scoringResult.findings,
      tierInfo: scoringResult.tierInfo,
      extractedFacts: extractedFacts,
    });

    // Track usage
    await subscriptionService.trackUsage(userId, "file_analysis", fileId, undefined, {
      filename: file.filename,
      score: scoringResult.totalScore,
    });

    // Apply redaction for free users
    let finalScoringResult = scoringResult;
    let finalExtractedFacts = extractedFacts;

    if (!isPro) {
      finalScoringResult = scoringEngine.redactResult(scoringResult);
      // Redact extracted facts as well
      finalExtractedFacts = {
        message: "Upgrade to Pro to unlock detailed extracted contract terms."
      } as any;
    }

    res.json({
      success: true,
      extractedFacts: finalExtractedFacts,
      scoringResult: finalScoringResult,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({
      error: "Analysis failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
