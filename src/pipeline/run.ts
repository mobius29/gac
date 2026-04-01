import { collectGitDiff, type GitCommandRunner } from "../git.js";
import { MockLlmProvider } from "../llm/mockProvider.js";
import type { LlmProvider } from "../llm/provider.js";
import type { ChunkSummary, DiffSource } from "../types.js";
import { generateCommitMessage } from "./generate.js";
import { createTrackedProvider, type LlmUsageMetrics } from "./usage.js";

export interface RunPipelineOptions {
  allowUnstagedFallback?: boolean;
  maximumTitleLength?: number;
  provider?: LlmProvider;
  gitRunner?: GitCommandRunner;
}

export interface RunPipelineResult {
  diffSource: DiffSource;
  rawDiff: string;
  hasChanges: boolean;
  commitMessage: string;
  sourceSummaries: ChunkSummary[];
  llmUsage: LlmUsageMetrics;
}

export async function runCommitMessagePipeline(
  options: RunPipelineOptions = {},
): Promise<RunPipelineResult> {
  const allowUnstagedFallback = options.allowUnstagedFallback ?? true;
  const provider = options.provider ?? new MockLlmProvider();
  const tracked = createTrackedProvider(provider);
  const collected = collectGitDiff({ allowUnstagedFallback }, options.gitRunner);

  if (!collected.rawDiff.trim()) {
    return {
      diffSource: collected.source,
      rawDiff: collected.rawDiff,
      hasChanges: false,
      commitMessage: "",
      sourceSummaries: [],
      llmUsage: tracked.getUsage(),
    };
  }

  const result = await generateCommitMessage(
    { rawDiff: collected.rawDiff, maximumTitleLength: options.maximumTitleLength },
    tracked.provider,
  );
  return {
    diffSource: collected.source,
    rawDiff: collected.rawDiff,
    hasChanges: true,
    commitMessage: result.commitMessage,
    sourceSummaries: result.sourceSummaries,
    llmUsage: tracked.getUsage(),
  };
}
