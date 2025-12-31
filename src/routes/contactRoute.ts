import { Router } from 'express';
import { handleContactForm } from '../controllers/contactController';

const router = Router();

/**
 * @swagger
 * /api/contact:
 *   post:
 *     tags: [Contact]
 *     summary: Submit the contact form
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, message]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string }
 *               message: { type: string }
 *     responses:
 *       200: { description: Message sent successfully }
 */
router.post('/', handleContactForm);

export default router;
