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

const aiService = new AIExtractionService();
const scoringEngine = new ScoringEngine();
const subscriptionService = new SubscriptionService();

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { originalname, mimetype, size, buffer } = req.file;
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

    const files = await prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(files);
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
    });

    // Track usage
    await subscriptionService.trackUsage(userId, "file_analysis", fileId, undefined, {
      filename: file.filename,
      score: scoringResult.totalScore,
    });

    res.json({
      success: true,
      extractedFacts,
      scoringResult,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({
      error: "Analysis failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
