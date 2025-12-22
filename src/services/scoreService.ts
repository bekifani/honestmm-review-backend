import prisma from "../config/prisma";
import { ScoringResult } from "./scoringEngine";

interface ScoreData {
  totalScore: number;
  metrics: ScoringResult["metrics"];
  flags: string[];
  recommendations: string[];
  grade: string;
  gradeDescription: string;
  findings: ScoringResult["findings"];
  tierInfo: ScoringResult["tierInfo"];
  extractedFacts?: any;
}

export async function saveScore(fileId: number, scoreData: ScoreData) {
  return await prisma.review.create({
    data: {
      fileId,
      content: scoreData as any,
    },
  });
}
