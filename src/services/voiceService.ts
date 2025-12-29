import { createClient } from "@deepgram/sdk";
import fs from "fs";

/**
 * VoiceService
 * Handles Speech-to-Text (Deepgram) and Text-to-Speech (Deepgram Aura)
 */
export class VoiceService {
    private deepgram: any;

    constructor() {
        const key = process.env.DEEPGRAM_API_KEY || process.env.Deep_gram_key;
        if (!key) {
            console.error("❌ No Deepgram API Key found in environment variables");
        }
        this.deepgram = createClient(key || "");
    }

    /**
     * Transcribe audio file using Deepgram
     */
    public async transcribeAudio(filePath: string): Promise<string> {
        try {
            const buffer = fs.readFileSync(filePath);
            const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
                buffer,
                {
                    model: "nova-2",
                    smart_format: true,
                    language: "en-US",
                }
            );

            if (error) throw error;

            return result.results.channels[0].alternatives[0].transcript || "";
        } catch (error) {
            console.error("Deepgram transcription error:", error);
            throw error;
        }
    }

    /**
     * Generate speech from text using Deepgram Aura
     * (Currently used as fallback or for manual triggers)
     */
    public async generateSpeech(text: string): Promise<Buffer> {
        try {
            const response = await this.deepgram.speak.request(
                { text },
                {
                    model: "aura-orion-en",
                    encoding: "linear16",
                    container: "wav", // For file download/generation we use WAV
                }
            );

            const stream = await response.getStream();
            if (!stream) throw new Error("Failed to get TTS stream");

            const reader = stream.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            return Buffer.concat(chunks);
        } catch (error) {
            console.error("Deepgram TTS error:", error);
            throw error;
        }
    }
}

export const voiceService = new VoiceService();
