import axios from "axios";
import prisma from "../config/prisma";
import { EmbeddingService } from "./embeddingService";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatService {
  private readonly apiKey: string;
  private readonly apiUrl = "https://api.deepseek.com/v1/chat/completions";
  private embeddingService: EmbeddingService;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not configured");
    }
    this.embeddingService = new EmbeddingService();
  }

  public async handleChatQuestion(
    fileId: number,
    question: string,
    sessionId = "default",
    userId?: number
  ): Promise<{ answer: string; sessionId: string; chatLogId: number }> {
    // Validate file & ownership is handled by controller; here we focus on AI + persistence
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        extractedFact: true,
      },
    });

    if (!file) {
      throw new Error("File not found");
    }

    const conversationHistory = await this.getConversationHistory(fileId, sessionId);

    // --- VECTOR RAG LOGIC ---
    const questionEmbedding = await this.embeddingService.generateEmbedding(question);
    const contextChunks = await this.embeddingService.search(fileId, questionEmbedding, 5);

    const prompt = this.createChatPrompt(
      contextChunks.join("\n\n---\n\n"),
      (file as any).extractedFact?.facts || {},
      question,
      conversationHistory
    );

    const aiResponse = await this.callDeepSeekAPI(prompt);

    const data: any = {
      question,
      answer: aiResponse,
      fileId,
      userId: userId!,
    };
    if (sessionId) data.sessionId = sessionId;
    const chatLog = await prisma.chatLog.create({ data });

    return { answer: aiResponse, sessionId, chatLogId: chatLog.id };
  }

  /**
   * Streaming version of handleChatQuestion
   */
  public async *handleChatQuestionStream(
    fileId: number,
    question: string,
    sessionId = "default",
    userId?: number,
    signal?: AbortSignal,
    isVoiceContext: boolean = false
  ): AsyncGenerator<string> {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { extractedFact: true },
    });

    if (!file) throw new Error("File not found");

    const conversationHistory = await this.getConversationHistory(fileId, sessionId);
    const questionEmbedding = await this.embeddingService.generateEmbedding(question);
    const contextChunks = await this.embeddingService.search(fileId, questionEmbedding, 5);

    const prompt = this.createChatPrompt(
      contextChunks.join("\n\n---\n\n"),
      (file as any).extractedFact?.facts || {},
      question,
      conversationHistory,
      isVoiceContext
    );

    // Call DeepSeek with streaming enabled
    const response = await axios.post(
      this.apiUrl,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: isVoiceContext
              ? "You are a helpful, conversational legal assistant. You are speaking to the user."
              : "You are a expert legal contract analyst. Answer precisely based on context.",
          },
          { role: "user", content: prompt },
        ],
        stream: true,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "stream",
        signal: signal as any // Pass the abort signal to axios
      }
    );

    let fullAnswer = "";

    // Process the stream
    const stream = response.data;

    for await (const chunk of stream) {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.substring(6));
            const content = data.choices[0]?.delta?.content || "";
            if (content) {
              fullAnswer += content;
              yield content;
            }
          } catch (e) {
            // Ignore parsing errors for partial lines
          }
        }
      }
    }

    // Save to DB AFTER stream completes (so we have the full answer)
    if (userId) {
      const data: any = {
        question,
        answer: fullAnswer,
        fileId,
        userId,
        sessionId: sessionId || "default"
      };
      await prisma.chatLog.create({ data });
    }
  }

  public async getChatHistory(fileId: number, sessionId = "default", userId?: number) {
    const where: any = { fileId };
    if (sessionId) where.sessionId = sessionId;
    if (userId) where.userId = userId;

    const chatLogs = await prisma.chatLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    return chatLogs;
  }

  public async clearContext(sessionId: string, fileId: number, userId?: number) {
    const where: any = { sessionId, fileId };
    if (userId) where.userId = userId;

    await prisma.chatLog.deleteMany({ where });
    return { success: true, message: "Context cleared" };
  }

  private async getConversationHistory(
    fileId: number,
    sessionId: string
  ): Promise<ChatMessage[]> {
    const where: any = { fileId };
    if (sessionId) where.sessionId = sessionId;
    const chatLogs = await prisma.chatLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    const messages: ChatMessage[] = [];
    for (const log of chatLogs) {
      messages.push({ role: "user", content: log.question });
      messages.push({ role: "assistant", content: log.answer });
    }
    return messages;
  }


  private createChatPrompt(
    relevantContext: string,
    extractedFacts: any,
    currentQuestion: string,
    conversationHistory: ChatMessage[],
    isVoiceContext: boolean = false
  ): string {
    const historyText = conversationHistory
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    const voiceInstructions = `
1. You are a helpful AI voice assistant explaining a contract.
2. If the user greets you (e.g., "Hello", "Hi"), respond politely and briefly (e.g., "Hello! What can I explain?"). Do NOT mention the contract content for greetings.
3. Answer naturally, concisely, and casually (like a conversation).
4. Do NOT read long lists or raw clause numbers unless asked.
5. Summarize the answer in 2-3 short sentences.
6. If the answer isn't in the contract, say "I couldn't find that in the document."
7. Speak directly to the user (use "you" and "the contract").
`;

    const textInstructions = `
1. If the user greets you, respond politely.
2. Answer based ONLY on the contract content and extracted facts for actual questions.
3. Be precise, professional, and concise.
4. If the answer isn't in the contract, say so clearly.
5. Reference specific clauses or terms when possible.
6. Maintain context from the conversation history.
7. Format your response in clear, readable paragraphs.
`;

    return `You are an expert legal contract analyst.
${isVoiceContext ? "You are speaking to the user via voice. Keep answers short and conversational." : ""}

RELEVANT CONTRACT SECTIONS:
${relevantContext || "No relevant sections found."}

EXTRACTED CONTRACT FACTS:
${JSON.stringify(extractedFacts || {}, null, 2)}

CONVERSATION HISTORY:
${historyText || "No previous conversation"}

CURRENT USER QUESTION:
${currentQuestion}

INSTRUCTIONS:
${isVoiceContext ? voiceInstructions : textInstructions}

Provide your response:`;
  }

  private async callDeepSeekAPI(prompt: string): Promise<string> {
    const response = await axios.post(
      this.apiUrl,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are a expert legal contract analyst with specialized knowledge in market maker agreements. Your task is to answer questions precisely based on contract content.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return (response.data as any).choices[0].message.content;
  }
}
