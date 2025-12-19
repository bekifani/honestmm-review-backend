import { Request, Response } from "express";
import prisma from "../config/prisma";
import { SubscriptionService } from "../services/subscriptionService";

const subscriptionService = new SubscriptionService();

export const saveChat = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { fileId, question, answer } = req.body;

        if (!fileId || !question || !answer) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Verify file ownership
        const file = await prisma.file.findUnique({ where: { id: Number(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const chat = await prisma.chatLog.create({
            data: {
                userId,
                fileId: Number(fileId),
                question,
                answer,
            },
        });

        // Track usage
        await subscriptionService.trackUsage(userId, "chat_message", Number(fileId), chat.id, {
            question: question.substring(0, 100), // Store first 100 chars for reference
        });

        res.status(201).json(chat);
    } catch (error) {
        console.error("Save chat error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

export const getChats = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const fileId = parseInt(req.params.fileId || '');
        if (isNaN(fileId)) return res.status(400).json({ error: "Invalid file ID" });

        // Verify file ownership
        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const chats = await prisma.chatLog.findMany({
            where: { fileId: fileId },
            orderBy: { createdAt: 'asc' },
        });

        res.json(chats);
    } catch (error) {
        console.error("Get chats error:", error);
        res.status(500).json({ error: "Server error" });
    }
};
