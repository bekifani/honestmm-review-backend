import { Request, Response } from "express";
import prisma from "../config/prisma";
import { ScoringEngine } from "../services/scoringEngine";
import { SubscriptionService } from "../services/subscriptionService";

const scoringEngine = new ScoringEngine();
const subscriptionService = new SubscriptionService();

export const saveReview = async (req: Request, res: Response) => {
    // ... existing code ...
    try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { fileId, content } = req.body;

        if (!fileId || !content) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Verify file ownership
        const file = await prisma.file.findUnique({ where: { id: Number(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const review = await prisma.review.create({
            data: {
                fileId: Number(fileId),
                content: content, // Assuming content is JSON object/array
            },
        });

        res.status(201).json(review);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
};

// export const getReview = async (req: Request, res: Response) => {
//     try {
//         const userId = (req.user as any)?.id;
//         if (!userId) return res.status(401).json({ error: "Unauthorized" });

//         const id = parseInt(req.params.id); // Review ID or File ID? User said "get the review for a file(agreement)... endpoint: /review/review_ID". 
//         // IF the user meant "get REVIEW by REVIEW ID", then param is reviewId.
//         // IF the user meant "get REVIEW for FILE ID", the logic might differ. 
//         // The prompt says: "endpoint: /review/review_ID purpose: get the review for a file(agreement)..."
//         // It's ambiguous. But standard is /resource/:id gets the resource.
//         // However, usually you want review FOR a file. 
//         // I will implement "Get Review by ID" as requested by endpoint name, but check ownership via file.

//         if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

//         const review = await prisma.review.findUnique({
//             where: { id: id },
//             include: { file: true }
//         });

//         if (!review) return res.status(404).json({ error: "Review not found" });
//         if (review.file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

//         res.json(review);
//     } catch (error) {
//         console.error("Get review error:", error);
//         res.status(500).json({ error: "Server error" });
//     }
// };

// Helper to get reviews by File ID if needed

export const getReviewsByFileId = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        const fileId = parseInt(req.params.fileId || "");
        if (isNaN(fileId)) return res.status(400).json({ error: "Invalid File ID" });

        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const subscription = await subscriptionService.getUserSubscription(userId);
        const isPro = subscription && subscription.status === "active";

        const reviews = await prisma.review.findMany({
            where: { fileId },
            include: { file: { select: { filename: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Redact content for free users
        const redactedReviews = reviews.map(review => {
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
                    // Redaction failed
                }
            }
            return review;
        });

        res.json(redactedReviews);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
}
