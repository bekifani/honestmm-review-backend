import express from "express";
import { requireAuth } from "../middleware/auth";
import upload from "../config/multer";
import { saveChat, getChats, askAI, clearChatContext } from "../controllers/chatController";
import {
  uploadFile,
  getFile,
  getAllFiles,
  analyzeFile,
} from "../controllers/fileController";
import {
  saveReview,
  getReviewsByFileId,
} from "../controllers/reviewController";
import {
  createWorkspace,
  getWorkspaces,
  deleteWorkspace,
} from "../controllers/workspaceController";
import {
  checkFileAnalysisLimit,
  checkChatMessageLimit,
} from "../middleware/usageLimit";

const router = express.Router();

router.use(requireAuth);

// File Routes
router.post("/file", upload.single("file"), uploadFile);
router.get("/file/:fileId", getFile);
router.get("/files", getAllFiles); // Additional helper
router.post("/file/:fileId/analyze", checkFileAnalysisLimit, analyzeFile); // AI Analysis with usage limit

// Chat Routes
router.post("/chat", checkChatMessageLimit, saveChat);
router.get("/chat/:fileId", getChats);
router.post("/chat/ask", checkChatMessageLimit, askAI);
router.post("/chat/clear", clearChatContext);

// Review Routes
router.post("/review", saveReview);
router.get("/review/file/:fileId", getReviewsByFileId);

// Workspace Routes
router.post("/workspace", createWorkspace);
router.get("/workspaces", getWorkspaces);
router.delete("/workspace/:id", deleteWorkspace);

/**
 * @swagger
 * tags:
 *   name: File Management
 *   description: File upload and management
 */

/**
 * @swagger
 * /file:
 *   post:
 *     summary: Upload a file
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /files:
 *   get:
 *     summary: Get all uploaded files for the user
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of files
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   filename: { type: string }
 *                   filetype: { type: string }
 *                   filesize: { type: integer }
 *                   filepath: { type: string }
 *                   createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /file/{id}:
 *   get:
 *     summary: Get a file by ID
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: File details
 *       404:
 *         description: File not found
 */

/**
 * @swagger
 * /file/{fileId}/analyze:
 *   post:
 *     summary: Analyze a market maker agreement file with AI
 *     tags: [File Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 extractedFacts: { type: object }
 *                 scoringResult: { type: object }
 *       400:
 *         description: Invalid file or missing text
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: File not found
 */

/**
 * @swagger
 * tags:
 *   name: Chat Logs
 *   description: Chat history for files
 */

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Save a chat log
 *     tags: [Chat Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileId, question, answer]
 *             properties:
 *               fileId: { type: integer }
 *               question: { type: string }
 *               answer: { type: string }
 *     responses:
 *       201:
 *         description: Chat saved
 *       400:
 *         description: Missing fields
 */

/**
 * @swagger
 * /chat/{fileId}:
 *   get:
 *     summary: Get chats for a file
 *     tags: [Chat Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of chats
 */

/**
 * @swagger
 * tags:
 *   name: AI Reviews
 *   description: AI Reviews management
 */

/**
 * @swagger
 * /review:
 *   post:
 *     summary: Save an AI review
 *     tags: [AI Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileId, content]
 *             properties:
 *               fileId: { type: integer }
 *               content: { type: object }
 *     responses:
 *       201:
 *         description: Review saved
 */

/**
 * @swagger
 * /review/{id}:
 *   get:
 *     summary: Get a review by ID
 *     tags: [AI Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Review details
 *       404:
 *         description: Not found
 */

export default router;
