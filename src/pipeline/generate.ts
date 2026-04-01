import { preprocessDiff } from "../diff/preprocess.js";
import { splitIntoChunks } from "../diff/chunk.js";
import { DEFAULT_MAXIMUM_TITLE_LENGTH } from "../config/load.js";
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

function resolveMaximumTitleLength(value: number | undefined): number {
  if (value == null) {
    return DEFAULT_MAXIMUM_TITLE_LENGTH;
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("maximumTitleLength must be a positive integer");
  }

  return value;
}

function shortenCommitSubject(subject: string, maximumTitleLength: number): string {
  const normalized = subject.trim().replace(/\s+/g, " ");
  if (normalized.length <= maximumTitleLength) {
    return normalized;
  }

  const conventionalMatch = normalized.match(/^([a-z]+(?:\([^)]+\))?:\s+)(.+)$/i);
  if (!conventionalMatch) {
    return normalized.slice(0, maximumTitleLength).trimEnd();
  }

  const prefix = conventionalMatch[1];
  const body = conventionalMatch[2];
  const maxBodyLength = maximumTitleLength - prefix.length;

  if (maxBodyLength <= 1) {
    return `${prefix}x`;
  }

  let truncatedBody = body.slice(0, maxBodyLength).trimEnd();
  if (body.length > maxBodyLength) {
    const lastWhitespace = truncatedBody.lastIndexOf(" ");
    if (lastWhitespace >= 4) {
      truncatedBody = truncatedBody.slice(0, lastWhitespace).trimEnd();
    }
  }

  if (truncatedBody.length === 0) {
    truncatedBody = body.slice(0, maxBodyLength).trimEnd() || "update";
  }

  return `${prefix}${truncatedBody}`;
}

export async function generateCommitMessage(
  input: PipelineInput,
  provider: LlmProvider,
): Promise<PipelineResult> {
  const maximumTitleLength = resolveMaximumTitleLength(input.maximumTitleLength);
  const preprocessed = preprocessDiff(input.rawDiff);
  const hasRawDiff = input.rawDiff.trim().length > 0;

  if (hasRawDiff && preprocessed.length === 0) {
    throw new Error("Unable to parse git diff into file patches");
  }

  if (!hasRawDiff || preprocessed.length === 0) {
    return {
      commitMessage: shortenCommitSubject(SAFE_CHORE_MESSAGE, maximumTitleLength),
      sourceSummaries: [],
    };
  }

  const chunks = splitIntoChunks(preprocessed);
  const summaries = await summarizeChunks(chunks, provider);
  const ranked = rankSummaries(summaries);

  if (ranked.length === 0) {
    return {
      commitMessage: shortenCommitSubject(SAFE_CHORE_MESSAGE, maximumTitleLength),
      sourceSummaries: [],
    };
  }

  const meaningfulRanked = ranked.filter((summary) => !summary.isNoise);

  if (meaningfulRanked.length === 0) {
    return {
      commitMessage: shortenCommitSubject(SAFE_CHORE_MESSAGE, maximumTitleLength),
      sourceSummaries: summaries,
    };
  }

  const strongMeaningfulRanked = meaningfulRanked.filter(
    (summary) => !isWeakSummaryText(summary.whatChanged),
  );
  const highestImportanceMeaningful = pickHighestImportanceSummary(meaningfulRanked);

  if (strongMeaningfulRanked.length === 0) {
    return {
      commitMessage: shortenCommitSubject(
        buildSummaryFallback(highestImportanceMeaningful),
        maximumTitleLength,
      ),
      sourceSummaries: summaries,
    };
  }

  try {
    const modelOutput = await synthesizeCommitMessage(
      strongMeaningfulRanked,
      provider,
      maximumTitleLength,
    );

    if (modelOutput.trim().length > 0) {
      return {
        commitMessage: shortenCommitSubject(modelOutput, maximumTitleLength),
        sourceSummaries: summaries,
      };
    }
  } catch {
    // Fall back to deterministic synthesis when provider output is invalid or unavailable.
  }

  return {
    commitMessage: shortenCommitSubject(buildSummaryFallback(highestImportanceMeaningful), maximumTitleLength),
    sourceSummaries: summaries,
  };
}
