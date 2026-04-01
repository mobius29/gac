import { preprocessDiff } from "../diff/preprocess.js";
import { splitIntoChunks } from "../diff/chunk.js";
import type { LlmProvider } from "../llm/provider.js";
import type { PipelineInput, PipelineResult } from "../types.js";
import type { RankedSummary } from "../types.js";
import { rankSummaries } from "./ranking.js";
import { summarizeChunks } from "./summarize.js";
import { synthesizeCommitMessage } from "./synthesize.js";
import { summaryFallbackSubject } from "../prompts.js";

const SAFE_CHORE_MESSAGE = "chore: update lockfile and generated files";

function isWeakSummaryText(whatChanged: string): boolean {
  const normalized = whatChanged.trim().toLowerCase();
  if (normalized.length < 12) {
    return true;
  }
  return (
    /^updated\s+\S+/i.test(normalized) ||
    /^modified\s+\S+/i.test(normalized) ||
    /^changed\s+\S+/i.test(normalized) ||
    normalized === "update project files"
  );
}

function pickHighestImportanceSummary(summaries: RankedSummary[]): RankedSummary | undefined {
  return summaries.reduce<RankedSummary | undefined>((best, current) => {
    if (!best) {
      return current;
    }

    if (current.importance !== best.importance) {
      return current.importance > best.importance ? current : best;
    }

    return current.rankScore > best.rankScore ? current : best;
  }, undefined);
}

function buildSummaryFallback(summary: RankedSummary | undefined): string {
  if (!summary) {
    return SAFE_CHORE_MESSAGE;
  }

  return `${summary.probableType}: ${summaryFallbackSubject(summary)}`;
}

export async function generateCommitMessage(
  input: PipelineInput,
  provider: LlmProvider,
): Promise<PipelineResult> {
  const preprocessed = preprocessDiff(input.rawDiff);
  const hasRawDiff = input.rawDiff.trim().length > 0;

  if (hasRawDiff && preprocessed.length === 0) {
    throw new Error("Unable to parse git diff into file patches");
  }

  if (!hasRawDiff || preprocessed.length === 0) {
    return {
      commitMessage: SAFE_CHORE_MESSAGE,
      sourceSummaries: [],
    };
  }

  const chunks = splitIntoChunks(preprocessed);
  const summaries = await summarizeChunks(chunks, provider);
  const ranked = rankSummaries(summaries);

  if (ranked.length === 0) {
    return {
      commitMessage: SAFE_CHORE_MESSAGE,
      sourceSummaries: [],
    };
  }

  const meaningfulRanked = ranked.filter((summary) => !summary.isNoise);

  if (meaningfulRanked.length === 0) {
    return {
      commitMessage: SAFE_CHORE_MESSAGE,
      sourceSummaries: summaries,
    };
  }

  const strongMeaningfulRanked = meaningfulRanked.filter(
    (summary) => !isWeakSummaryText(summary.whatChanged),
  );
  const highestImportanceMeaningful = pickHighestImportanceSummary(meaningfulRanked);

  if (strongMeaningfulRanked.length === 0) {
    return {
      commitMessage: buildSummaryFallback(highestImportanceMeaningful),
      sourceSummaries: summaries,
    };
  }

  try {
    const modelOutput = await synthesizeCommitMessage(strongMeaningfulRanked, provider);

    if (modelOutput.trim().length > 0) {
      return { commitMessage: modelOutput, sourceSummaries: summaries };
    }
  } catch {
    // Fall back to deterministic synthesis when provider output is invalid or unavailable.
  }

  return {
    commitMessage: buildSummaryFallback(highestImportanceMeaningful),
    sourceSummaries: summaries,
  };
}
