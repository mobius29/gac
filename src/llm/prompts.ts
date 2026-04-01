import type { DiffChunk, RankedSummary } from "../types.js";

function compactDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) {
    return diff;
  }
  return `${diff.slice(0, maxChars)}\n...<truncated>`;
}

export interface BuildChunkPromptOptions {
  maxDiffChars?: number;
}

export function buildSummarizeChunkPrompt(
  chunk: Pick<DiffChunk, "filePath" | "additions" | "deletions" | "noise" | "text">,
  options: BuildChunkPromptOptions = {},
): string {
  const maxDiffChars = options.maxDiffChars ?? 3500;
  return [
    "You summarize a git diff chunk into structured JSON.",
    "Return JSON only with keys: whatChanged, whyLikely, probableType, importance, isNoise.",
    "probableType must be one of: feat, fix, refactor, docs, test, chore.",
    "importance must be integer 1-10.",
    `FILE_PATH: ${chunk.filePath}`,
    `ADDITIONS: ${chunk.additions}`,
    `DELETIONS: ${chunk.deletions}`,
    `NOISE: ${String(chunk.noise.isNoise)}`,
    "DIFF:",
    compactDiff(chunk.text, maxDiffChars),
  ].join("\n");
}

export interface BuildSynthesisPromptOptions {
  maxSummaries?: number;
}

export function buildSynthesizeCommitPrompt(
  rankedSummaries: Pick<RankedSummary, "rankScore" | "filePath" | "whatChanged" | "probableType">[],
  options: BuildSynthesisPromptOptions = {},
): string {
  const maxSummaries = options.maxSummaries ?? 5;
  const top = rankedSummaries[0];
  const type = top?.probableType ?? "chore";
  const subject = top ? top.whatChanged.toLowerCase().replace(/[.]/g, "") : "update project files";
  const context = rankedSummaries
    .slice(0, maxSummaries)
    .map((summary) => `- [${summary.rankScore.toFixed(2)}] ${summary.filePath}: ${summary.whatChanged}`)
    .join("\n");

  return [
    "Generate exactly one Conventional Commit subject line.",
    "No body. Keep it concise and action-oriented.",
    `TOP_TYPE: ${type}`,
    `TOP_SUBJECT: ${subject}`,
    "RANKED_SUMMARIES:",
    context || "- none",
  ].join("\n");
}
