import axios from "axios";
import prisma from "../config/prisma";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatService {
  private readonly apiKey: string;
  private readonly apiUrl = "https://api.deepseek.com/v1/chat/completions";

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not configured");
    }
  }

  public async handleChatQuestion(
    fileId: number,
    question: string,
    sessionId = "default",
    userId?: number
  ): Promise<{ answer: string; sessionId: string; chatLogId: number }>
  {
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

    const prompt = this.createChatPrompt(
      file.extractedText || "",
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
    extractedText: string,
    extractedFacts: any,
    currentQuestion: string,
    conversationHistory: ChatMessage[]
  ): string {
    const historyText = conversationHistory
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    return `You are an expert legal contract analyst with specialized knowledge in market maker agreements.
Your task is to answer questions about the provided contract based on the extracted text and facts.

CONTRACT EXTRACTED TEXT:
${(extractedText || "").substring(0, 4000)}

EXTRACTED CONTRACT FACTS:
${JSON.stringify(extractedFacts || {}, null, 2)}

CONVERSATION HISTORY:
${historyText || "No previous conversation"}

CURRENT USER QUESTION:
${currentQuestion}

INSTRUCTIONS:
1. Answer based ONLY on the contract content and extracted facts
2. Be precise, professional, and concise
3. If the answer isn't in the contract, say so clearly
4. Reference specific clauses or terms when possible
5. Maintain context from the conversation history
6. Format your response in clear, readable paragraphs

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
