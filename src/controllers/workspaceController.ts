import { Request, Response } from "express";
import prisma from "../config/prisma";

export const createWorkspace = async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: "Workspace name is required" });
        }

        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const workspace = await prisma.workspace.create({
            data: {
                name,
                userId,
            },
        });

        res.status(201).json(workspace);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
};

export const getWorkspaces = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const workspaces = await prisma.workspace.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: { files: true },
                },
            },
        });

        res.json(workspaces);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
};

export const deleteWorkspace = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req.user as any)?.id;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: Number(id) },
        });

        if (!workspace) {
            return res.status(404).json({ error: "Workspace not found" });
        }

        if (workspace.userId !== userId) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Manually delete related records first because Cascade Delete is not enabled on DB level for File -> Reviews/Chats/etc
        const files = await prisma.file.findMany({
            where: { workspaceId: Number(id) },
            select: { id: true }
        });

        const fileIds = files.map(f => f.id);

        if (fileIds.length > 0) {
            await prisma.review.deleteMany({
                where: { fileId: { in: fileIds } }
            });
            await prisma.chatLog.deleteMany({
                where: { fileId: { in: fileIds } }
            });
            await prisma.extractedFact.deleteMany({
                where: { fileId: { in: fileIds } }
            });
            // UsageLog connects via integer ID but has no foreign key constraint relation in schema, so safe to ignore or keep.
        }

        await prisma.workspace.delete({
            where: { id: Number(id) },
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
};
