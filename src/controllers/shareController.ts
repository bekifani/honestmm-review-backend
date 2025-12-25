import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { ScoringEngine } from "../services/scoringEngine";
import { SubscriptionService } from "../services/subscriptionService";

const scoringEngine = new ScoringEngine();
const subscriptionService = new SubscriptionService();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_session_key";
const SHARE_EXPIRATION = "7d"; // Links valid for 7 days

export const createShareLink = async (req: Request, res: Response) => {
    // ... existing code ...
    try {
        const { fileId } = req.body;
        const userId = (req.user as any)?.id;

        if (!fileId) {
            return res.status(400).json({ error: "File ID is required" });
        }

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Verify ownership
        const file = await prisma.file.findUnique({
            where: { id: Number(fileId) },
        });

        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        if (file.userId !== userId) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Generate Share Token
        const token = jwt.sign(
            { fileId: file.id, type: "share" },
            JWT_SECRET,
            { expiresIn: SHARE_EXPIRATION }
        );

        // Return the token (Frontend constructs the URL)
        res.json({ token });
    } catch (error) {
        console.error("Create share link error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

export const getSharedContent = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ error: "Token is required" });
        }

        // Verify Token
        let decoded: any;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(403).json({ error: "Invalid or expired share link" });
        }

        if (!decoded.fileId || decoded.type !== "share") {
            return res.status(403).json({ error: "Invalid share token" });
        }

        const fileId = decoded.fileId;

        // Fetch File and Reviews
        const file = await prisma.file.findUnique({
            where: { id: fileId },
            include: {
                reviews: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            }
        });

        if (!file) {
            return res.status(404).json({ error: "Shared file not found" });
        }

        // Check original owner's subscription
        const ownerSubscription = await subscriptionService.getUserSubscription(file.userId);
        const isPro = ownerSubscription && ownerSubscription.status === "active";

        // Redact review content for free users
        const redactedReviews = file.reviews.map(review => {
            if (!isPro && review.content) {
                try {
                    const contentValue = typeof review.content === 'string' ? JSON.parse(review.content) : review.content;

                    if (contentValue.scoringResult) {
                        contentValue.scoringResult = scoringEngine.redactResult(contentValue.scoringResult);
                    } else {
                        // Raw ScoringResult
                        const redacted = scoringEngine.redactResult(contentValue);
                        if (typeof review.content === 'string') {
                            review.content = JSON.stringify(redacted);
                        } else {
                            review.content = redacted;
                        }
                        return review;
                    }

                    if (contentValue.extractedFacts) {
                        contentValue.extractedFacts = {
                            message: "Upgrade to Pro to unlock detailed extracted contract terms."
                        };
                    }

                    if (typeof review.content === 'string') {
                        review.content = JSON.stringify(contentValue);
                    } else {
                        review.content = contentValue;
                    }
                } catch (e) {
                    console.error("Redaction in getSharedContent failed", e);
                }
            }
            return review;
        });

        // Return file data (no user info for privacy)
        res.json({
            id: file.id,
            filename: file.filename,
            filesize: file.filesize,
            filetype: file.filetype,
            createdAt: file.createdAt,
            reviews: redactedReviews
        });
    } catch (error) {
        console.error("Get shared content error:", error);
        res.status(500).json({ error: "Server error" });
    }
};
