import type { ChunkSummary, RankedSummary } from "../types.js";

function computeRankScore(summary: ChunkSummary): number {
  let score = summary.importance;
  if (summary.isNoise) score -= 6;

  if (summary.probableType === "fix") score += 1.5;
  if (summary.probableType === "feat") score += 1;
  if (summary.probableType === "refactor") score += 0.5;

  return score;
}

export function rankSummaries(summaries: ChunkSummary[]): RankedSummary[] {
  return summaries
    .map((summary) => ({ ...summary, rankScore: computeRankScore(summary) }))
    .sort((a, b) => b.rankScore - a.rankScore);
}

export function selectTopMeaningfulSummary(ranked: RankedSummary[]): RankedSummary | undefined {
  return ranked.find((summary) => !summary.isNoise) ?? ranked[0];
}
