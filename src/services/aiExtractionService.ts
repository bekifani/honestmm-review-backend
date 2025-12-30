import axios from "axios";
import prisma from "../config/prisma";

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

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not configured");
    }
  }

  public async extractFacts(fileId: number): Promise<ExtractedFacts> {
    const file = await this.getFileWithText(fileId);
    const prompt = this.createExtractionPrompt(file.extractedText ?? "");
    const aiResponse = await this.callDeepSeekAPI(prompt);
    return this.processAIResponse(fileId, aiResponse);
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

Contract text (abbreviated):
${text.substring(0, 125000)}`;
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
      throw new Error("Failed to process AI extraction results");
    }
  }
}
