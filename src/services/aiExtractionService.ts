import axios from "axios";
import prisma from "../config/prisma";
import { EmbeddingService } from "./embeddingService";

interface ExtractedFacts {
  terminationRights?: string | null;
  sameNoticePeriod?: boolean | null;
  noticePeriodDays?: number | null;
  windDownDays?: number | null;
  windDownDefined?: boolean | null;
  forceMajeure?: string | null;
  fdv?: number | null;
  allocationSize?: number | null;
  exchange?: string | null;
  maxSpread?: number | null;
  exercisePeriodMonths?: number | null;
  unlockSchedule?: string | null;
  strikePrice?: string | null;
  premiumPercent?: number | null;
  clawback?: string | null;
  kpiClarity?: string | null;
  reporting?: string | null;
  kpiAdaptability?: string | null;
  remedyStructure?: string | null;
  curePeriodDays?: number | null;
  disputeResolution?: string | null;
  assetProtection?: string | null;
  feeStructure?: string | null;
  exclusivityMonths?: number | null;
}

export class AIExtractionService {
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

  public async extractFacts(fileId: number): Promise<ExtractedFacts> {
    const file = await this.getFileWithText(fileId);

    // --- VECTOR RAG FOR EXTRACTION ---
    // Instead of just the first 6000 chars, we retrieve the most "information-dense" chunks.
    // POLLING: Wait for vectorization to COMPLETE if this is a fresh upload
    let fileMeta = await (prisma as any).file.findUnique({
      where: { id: fileId },
      select: { vectorStatus: true, extractedText: true }
    });

    let attempts = 0;
    // Wait for COMPLETED or FAILED status (max 120 seconds)
    while (fileMeta?.vectorStatus !== "COMPLETED" && fileMeta?.vectorStatus !== "FAILED" && attempts < 60) {
      console.log(`RAG: Waiting for vectorization for file ${fileId} (Status: ${fileMeta?.vectorStatus}, Attempt ${attempts + 1}/60)...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      fileMeta = await (prisma as any).file.findUnique({
        where: { id: fileId },
        select: { vectorStatus: true, extractedText: true }
      });
      attempts++;
    }

    if (fileMeta?.vectorStatus !== "COMPLETED") {
      console.warn(`RAG: Vectorization did not complete for file ${fileId} (Status: ${fileMeta?.vectorStatus}). Falling back to truncated text.`);
      const contextText = fileMeta?.extractedText?.substring(0, 8000) || "";
      const prompt = this.createExtractionPrompt(contextText);
      const aiResponse = await this.callDeepSeekAPI(prompt);
      return this.processAIResponse(fileId, aiResponse);
    }

    // For extraction, we search for broad terms to get a good spread of the document.
    const searchTerms = [
      "termination notice period",
      "KPI performance spreading depth",
      "compensation fees service monthly",
      "governing law dispute resolution arbitration",
      "allocation size fdv exchange",
      "clawback reporting cure period",
      "asset protection segregation"
    ];

    const allRelevantChunks = new Set<string>();

    for (const term of searchTerms) {
      console.log(`RAG: Finding relevant chunks for "${term}" in Pinecone...`);
      const termEmbedding = await this.embeddingService.generateEmbedding(term);
      const matchingChunks = await this.embeddingService.search(fileId, termEmbedding, 5);

      matchingChunks.forEach((text) => allRelevantChunks.add(text));
    }

    console.log(`RAG: Retrieved ${allRelevantChunks.size} unique semantic chunks for Fact Extraction via Pinecone.`);

    const contextText = Array.from(allRelevantChunks).join("\n\n---\n\n");
    console.log("--- START OF PINECONE METADATA (TEXT GIVEN TO DEEPSEEK) ---");
    console.log(contextText);
    console.log("--- END OF PINECONE METADATA ---");

    const prompt = this.createExtractionPrompt(contextText);
    const aiResponse = await this.callDeepSeekAPI(prompt);

    // --- VERIFICATION LOOP (ROBUSTNESS) ---
    console.log(`RAG: Running verification pass for file ${fileId}...`);
    const verifiedFacts = await this.verifyResults(aiResponse, contextText);

    return this.processAIResponse(fileId, verifiedFacts);
  }

  private async verifyResults(initialResponse: string, contextText: string): Promise<string> {
    const verificationPrompt = `You are a legal auditor. Your task is to verify the accuracy of the extracted contract JSON below based on the original contract snippets.
    
SOURCE CONTRACT SNIPPETS:
${contextText}

INITIAL EXTRACTION RESULT:
${initialResponse}

INSTRUCTIONS:
1. Compare the JSON values against the source text.
2. If you find a mistake (e.g., notice period says 30 in JSON but 60 in text), FIX it in the JSON.
3. Ensure every field follows the allowed options in the schema.
4. If a value is missing or null but exists in the source text, fill it.
5. Return ONLY the final, corrected JSON object.

Corrected JSON:`;

    try {
      const correctedResponse = await this.callDeepSeekAPI(verificationPrompt);
      return correctedResponse;
    } catch (err) {
      console.warn("Verification Loop failed, falling back to initial extraction.", err);
      return initialResponse;
    }
  }

  private async getFileWithText(fileId: number) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { extractedText: true },
    });

    if (!file?.extractedText) {
      throw new Error(`File ${fileId} or its text not found`);
    }
    return file;
  }

  private createExtractionPrompt(text: string): string {
    return `Analyze this market maker agreement and extract key terms with high precision. Follow these guidelines:

1. For termination rights classification:
- "equal": Both parties have identical termination rights
- "minorAsymmetry": Small differences in termination conditions
- "someImbalance": Noticeable but reasonable differences
- "heavilyFavorsOne": One party has significantly better terms
- "oneSided": Only one party can terminate
- "noProjectRights": No termination clause exists

2. For notice periods:
- Extract exact day counts for noticePeriodDays and windDownDays
- Determine if windDown procedures are explicitly defined

3. For force majeure:
- Classify based on coverage symmetry and completeness

4. For numerical values:
- Extract exact numbers when available
- If ranges are given, use the midpoint
- If unspecified, leave null

5. For enumerated fields:
- Match exactly to the provided options
- If unclear, select the closest reasonable option

Return ONLY valid JSON matching this exact structure:
{
  "terminationRights": "equal|minorAsymmetry|someImbalance|heavilyFavorsOne|oneSided|noProjectRights",
  "sameNoticePeriod": boolean,
  "noticePeriodDays": number,
  "windDownDays": number,
  "windDownDefined": boolean,
  "forceMajeure": "equalCoverage|standardWithMinorGaps|basic|weakOrOneSided",
  "fdv": number,
  "allocationSize": number,
  "exchange": string,
  "maxSpread": number,
  "exercisePeriodMonths": number,
  "unlockSchedule": "linearOrStructured|reasonable|partialEarly|unrestricted",
  "strikePrice": "indexedToFMV|modestPremium|flat|discounted|highlyFavorable",
  "premiumPercent": number,
  "clawback": "strong|moderate|basic|weak",
  "kpiClarity": "clearAndMeasurable|wellDefinedMinorAmbiguities|generallyClear|basicWithGaps|vagueOrNone",
  "reporting": "realTimeOrDaily|regular|basic|unclearOrNone",
  "kpiAdaptability": "automatic|someFlexibility|fixed",
  "remedyStructure": "graduated|clear|basic|harsh|excessiveOrNone",
  "curePeriodDays": number,
  "disputeResolution": "arbitration|definedProcess|basic|unclearOrUnfavorable",
  "assetProtection": "clearSegregation|basic|limited|unclearOrInadequate",
  "feeStructure": "performanceBased|mixedReasonable|acceptableWithConcerns|excessiveOrUnfair",
  "exclusivityMonths": number
}

Contract text (Relevant Sections):
${text}
`;
  }

  private async callDeepSeekAPI(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `You are a expert legal contract analyst with specialized knowledge in market maker agreements. 
                Your task is to extract precise contractual terms and classify them according to strict guidelines.
                - Be conservative in your classifications
                - Prefer null/undefined over guessing
                - Maintain strict adherence to the output schema
                - For ambiguous cases, select the more neutral option`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 2500,
          response_format: { type: "json_object" },
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
    } catch (error) {
      console.error("DeepSeek API call failed:", error);
      throw new Error("AI extraction service unavailable");
    }
  }

  private async processAIResponse(
    fileId: number,
    response: string
  ): Promise<ExtractedFacts> {
    try {
      if (!response.trim().startsWith("{")) {
        throw new Error("Invalid JSON response from AI");
      }

      const facts = JSON.parse(response) as ExtractedFacts;

      // Define required fields
      const requiredFields: (keyof ExtractedFacts)[] = [
        "terminationRights",
        "sameNoticePeriod",
        "noticePeriodDays",
        "windDownDays",
        "windDownDefined",
        "forceMajeure",
      ];

      // Fill missing required fields with null instead of erroring
      for (const field of requiredFields) {
        if (!(field in facts)) {
          console.warn(`AI response missing field: ${field}, setting to null`);
          (facts as any)[field] = null;
        }
      }

      await prisma.extractedFact.create({
        data: {
          fileId,
          facts: JSON.parse(response),
        },
      });

      return facts;
    } catch (error) {
      console.error("AI response processing failed:", error);
      throw new Error("Failed to process AI extraction results");
    }
  }
}
