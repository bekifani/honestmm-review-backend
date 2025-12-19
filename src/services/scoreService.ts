import prisma from "../config/prisma";
import { ScoringResult } from "./scoringEngine";

interface ScoreData {
  totalScore: number;
  metrics: ScoringResult["metrics"];
  flags: string[];
  recommendations: string[];
}

export async function saveScore(fileId: number, scoreData: ScoreData) {
  return await prisma.review.create({
    data: {
      fileId,
      content: scoreData as any,
    },
  });
}
