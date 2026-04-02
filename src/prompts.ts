import type { ChunkSummary, DiffChunk, RankedSummary } from "./types.js";

function compactDiff(diff: string, maxChars = 3500): string {
  if (diff.length <= maxChars) {
    return diff;
  }
  return `${diff.slice(0, maxChars)}\n...<truncated>`;
}

export interface BuildChunkSummaryPromptOptions {
  maxDiffChars?: number;
}

export function buildChunkSummaryPrompt(
  chunk: DiffChunk,
  options: BuildChunkSummaryPromptOptions = {},
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

export function buildSynthesisPrompt(ranked: RankedSummary[], maximumTitleLength = 80): string {
  const top = ranked[0];
  const type = top?.probableType ?? "chore";
  const subject = top ? top.whatChanged.toLowerCase().replace(/[.]/g, "") : "update project files";
  const context = ranked
    .slice(0, 5)
    .map((s) => `- [${s.rankScore.toFixed(2)}] ${s.filePath}: ${s.whatChanged}`)
    .join("\n");

  return [
    "Generate exactly one Conventional Commit subject line.",
    "No body. Keep it concise and action-oriented.",
    `Subject must be <= ${maximumTitleLength} characters.`,
    `TOP_TYPE: ${type}`,
    `TOP_SUBJECT: ${subject}`,
    "RANKED_SUMMARIES:",
    context || "- none",
  ].join("\n");
}

export function summaryFallbackSubject(summary: ChunkSummary): string {
  const normalized = summary.whatChanged
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim();

  if (normalized.length === 0) {
    return "update project files";
  }

  const imperativeRewrites: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /^(updated|updating)\s+/i, replacement: "update " },
    { pattern: /^(modified|modifying)\s+/i, replacement: "update " },
    { pattern: /^(changed|changing)\s+/i, replacement: "update " },
    { pattern: /^(added|adding)\s+/i, replacement: "add " },
    { pattern: /^(removed|removing|deleted|deleting)\s+/i, replacement: "remove " },
  ];

  for (const rewrite of imperativeRewrites) {
    if (rewrite.pattern.test(normalized)) {
      return normalized.replace(rewrite.pattern, rewrite.replacement).trim();
    }
  }

  if (/^[A-Za-z0-9._/\-]+$/.test(normalized)) {
    return `update ${normalized}`;
  }

  return normalized;
}
