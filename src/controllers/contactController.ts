import { Request, Response } from 'express';
import { sendSupportNotification } from '../services/emailService';
import logger from '../config/logger';

/**
 * Handle contact form submission
 */
export const handleContactForm = async (req: Request, res: Response) => {
    try {
        const { firstName, lastName, email, message } = req.body;

        // Basic validation
        if (!firstName || !lastName || !email || !message) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Potential honeypot or rate limiting check could go here

        // Send notification email
        await sendSupportNotification({ firstName, lastName, email, message });

        res.status(200).json({ success: true, message: 'Message sent successfully.' });
    } catch (error: any) {
        logger.error(`Contact form error: ${error.message}`);
        res.status(500).json({ error: 'Failed to send message. Please try again later.' });
    }
};
