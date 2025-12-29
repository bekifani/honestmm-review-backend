import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { Socket } from 'socket.io';
import { ChatService } from './chatService';

/**
 * DeepgramRelay
 * Manages a voice session:
 * 1. Deepgram Listen (STT)
 * 2. DeepSeek Logic (LLM) (via ChatService)
 * 3. Deepgram Speak (TTS)
 */
export class RealtimeRelay {
    private deepgram: any;
    private deepgramLive: any;
    private frontendSocket: Socket;
    private isConnected: boolean = false;
    private chatService: ChatService;

    // Buffer for Accumulating User Speech properly
    private currentTranscript: string = "";
    private isProcessingResponse = false;
    private keepAliveTimer: NodeJS.Timeout | null = null;
    private fileId: number | null = null;
    private abortController: AbortController | null = null;

    constructor(socket: Socket) {
        this.frontendSocket = socket;
        this.chatService = new ChatService();

        // Use the key provided by user or env
        const key = process.env.DEEPGRAM_API_KEY || process.env.Deep_gram_key;
        if (!key) {
            console.error("❌ No Deepgram API Key found in environment variables");
        }
        this.deepgram = createClient(key || "");
    }

    public async connect() {
        if (this.isConnected) return;

        console.log("🔌 Connecting to Deepgram Live...");

        // Setup Live Transcription
        this.deepgramLive = this.deepgram.listen.live({
            model: "nova-2",
            language: "en-US",
            smart_format: true,
            interim_results: true,
            endpointing: 500, // 500ms silence detection
            vad_events: true,
            encoding: "linear16",
            sample_rate: 24000,
        });

        this.deepgramLive.on(LiveTranscriptionEvents.Open, () => {
            console.log("✅ Deepgram Logic Connected");
            this.isConnected = true;
            this.frontendSocket.emit('openai:connected'); // Keep event name for frontend compatibility
        });

        this.deepgramLive.on(LiveTranscriptionEvents.Close, () => {
            console.log("❌ Deepgram Disconnected");
            this.isConnected = false;
        });

        this.deepgramLive.on(LiveTranscriptionEvents.Transcript, (data: any) => {
            this.resetInactivityTimeout(); // User is active
            const transcript = data.channel.alternatives[0]?.transcript || "";
            const isFinal = data.is_final;
            const speechFinal = data.speech_final;

            if (transcript) {
                console.log(`📝 [DG] Transcript: "${transcript}" (isFinal: ${isFinal}, speechFinal: ${speechFinal})`);
            }

            if (!transcript && !speechFinal) return;

            // Send interim to frontend for "Typing" effect
            this.frontendSocket.emit('server:transcript', { text: this.currentTranscript + transcript, isFinal: false });

            if (isFinal) {
                this.currentTranscript += " " + transcript;
                this.frontendSocket.emit('server:transcript', { text: this.currentTranscript, isFinal: true });

                // If Deepgram says speech is finished (Endpointing), trigger the AI
                if (data.speech_final) {
                    const textToProcess = this.currentTranscript.trim();
                    if (textToProcess) {
                        console.log(`🎤 Speech Final Detected: "${textToProcess}". Processing...`);
                        this.frontendSocket.emit('server:thinking');
                        this.processUserQuery(textToProcess);
                        this.currentTranscript = ""; // Reset for next turn
                    } else {
                        // console.log("🙊 Speech Final with empty text. Ignoring.");
                    }
                }
            }
        });

        this.deepgramLive.on(LiveTranscriptionEvents.Error, (err: any) => {
            console.error("Deepgram Error:", err);
        });

        // 🧠 CLOUD BARGE-IN: Deepgram AI detects human voice
        this.deepgramLive.on(LiveTranscriptionEvents.SpeechStarted, (data: any) => {
            if (this.isProcessingResponse) {
                console.log("☁️ Deepgram Detected Speech Start. (Ignoring due to false positives)");
                // this.interrupt();
                // this.frontendSocket.emit('server:interrupt');
            }
        });

        this.setupFrontendListeners();
    }

    private setupFrontendListeners() {
        this.frontendSocket.on('client:audio-chunk', (data: { audio: string }) => {
            if (this.deepgramLive && this.deepgramLive.getReadyState() === 1) {
                // console.log("🔈 Received Audio Chunk from Frontend");
                const audioBuffer = Buffer.from(data.audio, 'base64');
                this.deepgramLive.send(audioBuffer);
            } else {
                if (this.isConnected) {
                    console.warn("⚠️ Deepgram connection not ready for audio. ReadyState:", this.deepgramLive?.getReadyState());
                }
            }
        });

        this.frontendSocket.on('client:disconnect', () => {
            this.disconnect();
        });

        // Keep-Alive: Send silence every 3 seconds if nothing else is sent
        this.startKeepAlive();
    }

    private inactivityTimeout: NodeJS.Timeout | null = null;
    private readonly MAX_INACTIVITY_MS = 60 * 1000; // 1 minute timeout for cost safety

    private startKeepAlive() {
        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => {
            if (this.isConnected && this.deepgramLive && this.deepgramLive.getReadyState() === 1) {
                // Send JSON KeepAlive to save costs (audio buffers are billed, control messages are free)
                this.deepgramLive.send(JSON.stringify({ type: 'KeepAlive' }));
            }
        }, 3000); // 3 seconds
        this.resetInactivityTimeout();
    }

    private resetInactivityTimeout() {
        if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
        this.inactivityTimeout = setTimeout(() => {
            console.log("⏰ Session Timed Out due to inactivity. Closing connection.");
            this.frontendSocket.emit('server:ai-response', { text: "Session timed out due to inactivity to save resources." });
            this.disconnect();
        }, this.MAX_INACTIVITY_MS);
    }

    private stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    public setContext(fileId: number) {
        this.fileId = fileId;
        console.log(`📝 Context set to File ID: ${fileId}`);
    }

    /**
     * The Brain: Send text to DeepSeek and vocalize response
     */
    private async processUserQuery(text: string) {
        if (!text || this.isProcessingResponse) return;
        this.isProcessingResponse = true;

        try {
            const userId = (this.frontendSocket as any).userId;
            console.log(`🧠 AI Thinking on: "${text}" (FileId: ${this.fileId}, UserId: ${userId})`);

            if (!this.fileId) {
                await this.speak("I need you to select a document first so I can answer your questions.");
                return;
            }
            console.log(`🧠 AI Thinking (Streaming): "${text}" (FileId: ${this.fileId}, UserId: ${userId})`);

            // 1. Send User Message to Chat UI immediately
            this.frontendSocket.emit('server:new-message', {
                role: 'user',
                content: text
            });

            this.abortController = new AbortController();

            const stream = this.chatService.handleChatQuestionStream(
                this.fileId,
                text,
                "default",
                userId,
                this.abortController.signal,
                true // isVoiceContext
            );

            let fullAnswer = "";
            let sentenceBuffer = "";

            for await (const chunk of stream) {
                if (this.abortController.signal.aborted) {
                    console.log("🛑 LLM Stream Aborted mid-loop");
                    break;
                }
                fullAnswer += chunk;
                sentenceBuffer += chunk;

                // Sync UI text in real-time
                this.frontendSocket.emit('server:ai-response', { text: fullAnswer });

                // Check for sentence endings: . ! ? followed by space or newline
                // Using a regex to detect ending punctuation
                const lastChar = sentenceBuffer.trim().slice(-1);
                if (/[.!?\n]/.test(lastChar) && sentenceBuffer.length > 20) {
                    const cleanSentence = this.cleanTextForTTS(sentenceBuffer);
                    if (cleanSentence) {
                        if (this.abortController.signal.aborted) break;
                        console.log(`🔊 Speaking Sentence: "${cleanSentence}"`);
                        await this.speak(cleanSentence); // Wait for this sentence to finish/pipe
                        sentenceBuffer = ""; // Clear for next sentence
                    }
                }
            }

            // Speak any remaining text in the buffer (unless aborted)
            if (sentenceBuffer.trim() && !this.abortController.signal.aborted) {
                const cleanSentence = this.cleanTextForTTS(sentenceBuffer);
                if (cleanSentence) {
                    await this.speak(cleanSentence);
                }
            }

            // Final Update to Chat UI
            this.frontendSocket.emit('server:new-message', {
                role: 'model',
                content: fullAnswer
            });

        } catch (err: any) {
            console.error("AI Processing Error:", err);
            const errorMsg = `Internal error: ${err.message || "I had trouble thinking of an answer."}`;
            this.frontendSocket.emit('server:ai-response', { text: errorMsg });
            await this.speak(errorMsg);
        } finally {
            this.isProcessingResponse = false;
            this.frontendSocket.emit('server:speech-stopped');
        }
    }

    private async speak(text: string) {
        try {
            console.log("🗣️ Generating Audio for:", text);

            // Deepgram Aura TTS
            const response = await this.deepgram.speak.request(
                { text },
                {
                    model: "aura-orion-en", // Male voice (Orion)
                    encoding: "linear16",    // Match frontend PCM expectation
                    container: "none",      // RAW bits, no WAV header
                    sample_rate: 24000
                }
            );

            // Get the audio stream
            const stream = await response.getStream();
            if (stream) {
                this.frontendSocket.emit('server:speech-started');
                const reader = stream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Stop sending audio if interrupted
                    if (!this.isProcessingResponse || (this.abortController && this.abortController.signal.aborted)) {
                        console.log("🚫 TTS Stream halted due to interrupt.");
                        break;
                    }

                    if (value) {
                        // Send chunk to frontend
                        this.frontendSocket.emit('server:audio-chunk', {
                            audio: Buffer.from(value).toString('base64')
                        });
                    }
                }
            }
        } catch (err) {
            console.error("TTS Error:", err);
        }
    }

    public interrupt() {
        if (this.abortController) {
            console.log("🛑 Interrupt Signal Received. Killing active processes.");
            this.abortController.abort();
            this.isProcessingResponse = false;
            this.frontendSocket.emit('server:speech-stopped');
        }
    }

    private cleanTextForTTS(text: string): string {
        return text
            .replace(/\*\*/g, '') // Remove bold stars
            .replace(/\*/g, '')  // Remove single stars
            .replace(/#/g, '')   // Remove headers
            .replace(/`/g, '')   // Remove code backticks
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
            .replace(/  +/g, ' ') // Remove double spaces
            .trim();
    }

    public disconnect() {
        this.stopKeepAlive();
        if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
        if (this.deepgramLive) {
            this.deepgramLive.finish();
            this.deepgramLive = null;
        }
        this.isConnected = false;
    }
}
