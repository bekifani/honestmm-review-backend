import { Request, Response } from "express";
import { voiceService } from "../services/voiceService";
import fs from "fs-extra";
import path from "path";

export const transcribeVoice = async (req: Request, res: Response) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "No audio file provided." });
        }

        // Get the absolute path to the uploaded file
        const filePath = path.resolve(file.path);

        console.log(`Voice: Transcribing file ${file.originalname} (${file.size} bytes)...`);

        // Transcribe using Whisper
        const transcription = await voiceService.transcribeAudio(filePath);

        // Clean up: delete the temp file
        await fs.remove(filePath);

        console.log(`Voice: Transcription complete: "${transcription}"`);

        return res.json({ text: transcription });
    } catch (error) {
        console.error("Voice transcription controller error:", error);
        // Try to cleanup even on error
        if (req.file) {
            await fs.remove(req.file.path).catch(() => { });
        }
        return res.status(500).json({ error: "Failed to transcribe audio." });
    }
};

export const textToSpeech = async (req: Request, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: "No text provided for TTS." });
        }

        console.log(`Voice: Generating speech for text: "${text.substring(0, 50)}..."`);

        const audioBuffer = await voiceService.generateSpeech(text);

        res.set({
            "Content-Type": "audio/wav",
            "Content-Length": audioBuffer.length,
        });

        return res.send(audioBuffer);
    } catch (error) {
        console.error("TTS controller error:", error);
        return res.status(500).json({ error: "Failed to generate speech." });
    }
};
