import { Request, Response } from "express";
import prisma from "../config/prisma";
import { SubscriptionService } from "../services/subscriptionService";
import { ChatService } from "../services/chatService";

const subscriptionService = new SubscriptionService();

export const saveChat = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { fileId, question, answer, sessionId } = req.body;

        if (!fileId || !question || !answer) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Verify file ownership
        const file = await prisma.file.findUnique({ where: { id: Number(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const chatData: any = {
            userId,
            fileId: Number(fileId),
            question,
            answer,
        };
        if (sessionId) chatData.sessionId = sessionId;
        const chat = await prisma.chatLog.create({ data: chatData });

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

        const sessionId = (req.query.sessionId as string) || undefined;

        const where: any = { fileId };
        if (sessionId) where.sessionId = sessionId;
        const chats = await prisma.chatLog.findMany({
            where,
            orderBy: { createdAt: 'asc' },
        });

        res.json(chats);
    } catch (error) {
        console.error("Get chats error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Ask AI a question about a file and record the chat
 */
export const askAI = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { fileId, question, sessionId } = req.body as {
            fileId?: number;
            question?: string;
            sessionId?: string;
        };

        if (!fileId || !question) {
            return res.status(400).json({ error: "Missing required fields: fileId, question" });
        }

        // Verify file ownership
        const file = await prisma.file.findUnique({ where: { id: Number(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const chatService = new ChatService();
        const result = await chatService.handleChatQuestion(Number(fileId), question, sessionId || "default", userId);

        // Track usage
        await subscriptionService.trackUsage(
            userId,
            "chat_message",
            Number(fileId),
            result.chatLogId,
            { question: question.substring(0, 100) }
        );

        return res.json({
            answer: result.answer,
            sessionId: result.sessionId,
            chatLogId: result.chatLogId,
        });
    } catch (error) {
        console.error("Ask AI error:", error);
        return res.status(500).json({ error: "Failed to process question" });
    }
};

/**
 * Clear chat context for a session
 */
export const clearChatContext = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { fileId, sessionId } = req.body as { fileId?: number; sessionId?: string };
        if (!fileId || !sessionId) {
            return res.status(400).json({ error: "Missing required fields: fileId, sessionId" });
        }

        // Verify file ownership
        const file = await prisma.file.findUnique({ where: { id: Number(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });
        if (file.userId !== userId) return res.status(403).json({ error: "Forbidden" });

        const chatService = new ChatService();
        const result = await chatService.clearContext(sessionId, Number(fileId), userId);
        return res.json(result);
    } catch (error) {
        console.error("Clear chat error:", error);
        return res.status(500).json({ error: "Failed to clear context" });
    }
};
