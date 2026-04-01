import type { ChangeType, ChunkSummary } from "../types.js";

export interface RankedChunkSummary extends ChunkSummary {
  rankScore: number;
  originalIndex: number;
}

export interface RankSummariesOptions {
  noisePenalty?: number;
  typeBoosts?: Partial<Record<ChangeType, number>>;
}

export interface FilterForSynthesisOptions {
  limit?: number;
  includeNoiseWhenAllNoise?: boolean;
}

const DEFAULT_NOISE_PENALTY = 5;
const DEFAULT_LIMIT = 5;

const DEFAULT_TYPE_BOOSTS: Record<ChangeType, number> = {
  feat: 1.2,
  fix: 1.5,
  refactor: 0.8,
  docs: 0.2,
  test: 0.4,
  chore: 0,
};

function compareRanked(a: RankedChunkSummary, b: RankedChunkSummary): number {
  if (a.isNoise !== b.isNoise) {
    return a.isNoise ? 1 : -1;
  }

  if (a.rankScore !== b.rankScore) {
    return b.rankScore - a.rankScore;
  }

  if (a.importance !== b.importance) {
    return b.importance - a.importance;
  }

  const filePathComparison = a.filePath.localeCompare(b.filePath);
  if (filePathComparison !== 0) {
    return filePathComparison;
  }

  return a.originalIndex - b.originalIndex;
}

export function computeRankScore(
  summary: ChunkSummary,
  options: RankSummariesOptions = {},
): number {
  const noisePenalty = options.noisePenalty ?? DEFAULT_NOISE_PENALTY;
  const boosts = { ...DEFAULT_TYPE_BOOSTS, ...options.typeBoosts };

  let score = summary.importance * 2 + boosts[summary.probableType];
  if (summary.isNoise) {
    score -= noisePenalty;
  }

  return score;
}

export function rankSummaries(
  summaries: ChunkSummary[],
  options: RankSummariesOptions = {},
): RankedChunkSummary[] {
  return summaries
    .map((summary, originalIndex) => ({
      ...summary,
      originalIndex,
      rankScore: computeRankScore(summary, options),
    }))
    .sort(compareRanked);
}

export function filterForSynthesis(
  ranked: RankedChunkSummary[],
  options: FilterForSynthesisOptions = {},
): RankedChunkSummary[] {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const includeNoiseWhenAllNoise = options.includeNoiseWhenAllNoise ?? true;

  const meaningful = ranked.filter((entry) => !entry.isNoise).slice(0, limit);
  if (meaningful.length > 0) {
    return meaningful;
  }

  return includeNoiseWhenAllNoise ? ranked.slice(0, limit) : [];
}

export function selectTopSummary(ranked: RankedChunkSummary[]): RankedChunkSummary | undefined {
  return ranked.find((entry) => !entry.isNoise) ?? ranked[0];
}
