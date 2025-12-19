/**
 * @swagger
 * tags:
 *   - name: Chat
 *     description: Chat with AI about uploaded files and manage chat history
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ChatLog:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         userId:
 *           type: integer
 *         fileId:
 *           type: integer
 *         question:
 *           type: string
 *         answer:
 *           type: string
 *         sessionId:
 *           type: string
 *           example: default
 *           description: Threading key to separate chat sessions per file
 *         createdAt:
 *           type: string
 *           format: date-time
 *     ChatAskRequest:
 *       type: object
 *       required: [fileId, question]
 *       properties:
 *         fileId:
 *           type: integer
 *           example: 42
 *         question:
 *           type: string
 *           example: What is the notice period defined in this agreement?
 *         sessionId:
 *           type: string
 *           example: default
 *           description: Optional session/thread ID. Defaults to "default".
 *     ChatAskResponse:
 *       type: object
 *       properties:
 *         answer:
 *           type: string
 *         sessionId:
 *           type: string
 *         chatLogId:
 *           type: integer
 *     ChatClearRequest:
 *       type: object
 *       required: [fileId, sessionId]
 *       properties:
 *         fileId:
 *           type: integer
 *         sessionId:
 *           type: string
 */

/**
 * @swagger
 * /chat/ask:
 *   post:
 *     summary: Ask AI a question about a file
 *     description: Sends a question to the AI referencing the uploaded file contents/facts and returns the AI's answer. Each call is logged as a chat message and counted towards chat usage limits.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatAskRequest'
 *     responses:
 *       200:
 *         description: AI answered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatAskResponse'
 *       400:
 *         description: Missing or invalid parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (file ownership) or chat limit reached
 *       500:
 *         description: Failed to process question
 */

/**
 * @swagger
 * /chat/{fileId}:
 *   get:
 *     summary: Get chat history for a file
 *     description: Returns chat logs for the given file. Optionally filter by sessionId to scope to a single conversation thread.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sessionId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional session/thread ID to filter results
 *     responses:
 *       200:
 *         description: List of chat logs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatLog'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (file ownership)
 *       404:
 *         description: File not found
 */

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Save a chat message (manual)
 *     description: Store a chat message (question/answer) you already generated on the client. Prefer /chat/ask for AI generated answers.
 *     tags: [Chat]
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
 *               fileId:
 *                 type: integer
 *               question:
 *                 type: string
 *               answer:
 *                 type: string
 *               sessionId:
 *                 type: string
 *                 example: default
 *     responses:
 *       201:
 *         description: Chat saved
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (file ownership)
 */

/**
 * @swagger
 * /chat/clear:
 *   post:
 *     summary: Clear chat context for a session
 *     description: Deletes all chat logs for the given fileId + sessionId to reset conversation context.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatClearRequest'
 *     responses:
 *       200:
 *         description: Context cleared
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Context cleared
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (file ownership)
 */
