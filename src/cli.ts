#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { getCompletionScript, isCompletionShell, type CompletionShell } from "./completion.js";
import { DEFAULT_MAXIMUM_TITLE_LENGTH, loadConfig, type AppConfig } from "./config/load.js";
import { createPullRequest } from "./gh.js";
import { collectBranchDiff, commitWithMessage, ensureCurrentBranchOnOrigin } from "./git.js";
import { createProviderFromConfig } from "./llm/factory.js";
import { MockLlmProvider } from "./llm/mockProvider.js";
import type { LlmProvider } from "./llm/provider.js";
import { generateCommitMessage } from "./pipeline/generate.js";
import { rankSummaries } from "./pipeline/ranking.js";
import { runCommitMessagePipeline, type RunPipelineResult } from "./pipeline/run.js";
import { createTrackedProvider, type LlmUsageMetrics } from "./pipeline/usage.js";
import type { ChunkSummary } from "./types.js";

interface CliOptions {
  allowUnstagedFallback: boolean;
  commit: boolean;
  debug: boolean;
  help: boolean;
  pullRequestBase?: string;
}

export interface CliDeps {
  runPipeline?: (options: {
    allowUnstagedFallback: boolean;
    maximumTitleLength?: number;
    provider?: LlmProvider;
  }) => Promise<RunPipelineResult>;
  generateFromRawDiff?: (options: {
    rawDiff: string;
    maximumTitleLength: number;
    provider: LlmProvider;
  }) => Promise<{
    commitMessage: string;
    sourceSummaries: ChunkSummary[];
    llmUsage: LlmUsageMetrics;
  }>;
  commitChanges?: (options: {
    message: string;
    source: RunPipelineResult["diffSource"];
  }) => void | Promise<void>;
  createPullRequest?: (options: {
    title: string;
    base: string;
    body: string;
  }) => void | Promise<void>;
  collectBranchDiff?: (baseBranch: string) => string | Promise<string>;
  ensureCurrentBranchOnOrigin?: () => string | Promise<string>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function parsePositiveInteger(value: string, context: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid MAXIMUM_TITLE_LENGTH from ${context}: expected a positive integer`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid MAXIMUM_TITLE_LENGTH from ${context}: expected a positive integer`);
  }
  return parsed;
}

function mergeRuntimeConfig(fileConfig: AppConfig, env: NodeJS.ProcessEnv): AppConfig {
  const maximumTitleLengthRaw = firstNonEmpty(
    env.GIT_AUTO_COMMIT_MAXIMUM_TITLE_LENGTH,
    env.MAXIMUM_TITLE_LENGTH,
  );
  const maximumTitleLength =
    maximumTitleLengthRaw == null
      ? fileConfig.maximumTitleLength
      : parsePositiveInteger(
          maximumTitleLengthRaw,
          "environment variables GIT_AUTO_COMMIT_MAXIMUM_TITLE_LENGTH/MAXIMUM_TITLE_LENGTH",
        );

  return {
    llmProvider: firstNonEmpty(
      env.GIT_AUTO_COMMIT_LLM_PROVIDER,
      env.LLM_PROVIDER,
      fileConfig.llmProvider,
    ),
    openaiApiKey: firstNonEmpty(env.OPENAI_API_KEY),
    openaiModel: firstNonEmpty(env.OPENAI_MODEL, fileConfig.openaiModel),
    openaiBaseUrl: firstNonEmpty(env.OPENAI_BASE_URL),
    maximumTitleLength,
  };
}

function parsePullRequestBase(
  argv: string[],
  index: number,
): { base: string; nextIndex: number } {
  const current = argv[index];
  if (current?.startsWith("--pr=")) {
    const value = current.slice("--pr=".length).trim();
    if (value.length === 0) {
      throw new Error("--pr requires a non-empty target branch");
    }
    return { base: value, nextIndex: index };
  }

  const next = argv[index + 1];
  if (next == null || next.startsWith("-")) {
    throw new Error("--pr requires a target branch argument");
  }

  const trimmed = next.trim();
  if (trimmed.length === 0) {
    throw new Error("--pr requires a non-empty target branch");
  }

  return { base: trimmed, nextIndex: index + 1 };
}

function parseCompletionShell(argv: string[]): CompletionShell | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    let value: string | undefined;

    if (arg === "--completion") {
      const next = argv[index + 1];
      if (next == null || next.startsWith("-")) {
        throw new Error("--completion requires a shell argument (bash|zsh)");
      }
      value = next.trim();
      index += 1;
    } else if (arg.startsWith("--completion=")) {
      value = arg.slice("--completion=".length).trim();
    } else {
      continue;
    }

    if (!value) {
      throw new Error("--completion requires a shell argument (bash|zsh)");
    }

    const normalized = value.toLowerCase();
    if (!isCompletionShell(normalized)) {
      throw new Error(`Unsupported shell for --completion: ${value}. Supported shells: bash, zsh`);
    }
    return normalized;
  }

  return undefined;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    allowUnstagedFallback: true,
    commit: false,
    debug: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-unstaged-fallback") {
      options.allowUnstagedFallback = false;
      continue;
    }
    if (arg === "--commit") {
      options.commit = true;
      continue;
    }
    if (arg === "--debug") {
      options.debug = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--pr" || arg.startsWith("--pr=")) {
      const parsed = parsePullRequestBase(argv, index);
      options.pullRequestBase = parsed.base;
      index = parsed.nextIndex;
    }
  }

  return options;
}

function buildHelpText(): string {
  return [
    "Usage: gac [options]",
    "",
    "Options:",
    "  -h, --help                 Show this help message and exit",
    "      --commit               Commit with the generated message",
    "      --pr <target-branch>   Create GitHub pull request targeting branch",
    "      --completion <shell>   Print shell completion script (bash|zsh)",
    "      --debug                Print pipeline debug metadata to stderr",
    "      --no-unstaged-fallback Only read staged diff; do not fallback to unstaged diff",
  ].join("\n");
}

function emptyUsageMetrics(): LlmUsageMetrics {
  return {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

function addUsage(target: LlmUsageMetrics, usage: LlmUsageMetrics): void {
  target.requestCount += usage.requestCount;
  target.promptTokens += usage.promptTokens;
  target.completionTokens += usage.completionTokens;
  target.totalTokens = target.promptTokens + target.completionTokens;
}

function normalizeBulletText(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/^[\-*]\s*/, "");
}

function buildPullRequestBody(summaries: ChunkSummary[]): string {
  const rankedMeaningful = rankSummaries(summaries)
    .filter((summary) => !summary.isNoise)
    .slice(0, 8);

  if (rankedMeaningful.length === 0) {
    return "## Summary\n- Update branch changes\n";
  }

  const summaryLines = rankedMeaningful
    .map((summary) => normalizeBulletText(summary.whatChanged))
    .filter((line) => line.length > 0)
    .map((line) => `- ${line}`);

  const rationaleLines = rankedMeaningful
    .map((summary) => normalizeBulletText(summary.whyLikely))
    .filter((line, index, items) => line.length > 0 && items.indexOf(line) === index)
    .slice(0, 5)
    .map((line) => `- ${line}`);

  const body = ["## Summary", ...summaryLines, "", "## Why", ...rationaleLines];
  return `${body.join("\n")}\n`;
}

function formatUsageMetrics(usage: LlmUsageMetrics): string {
  return `LLM usage: requests=${usage.requestCount} tokens=${usage.totalTokens} (prompt=${usage.promptTokens}, completion=${usage.completionTokens})`;
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const runPipeline = deps.runPipeline ?? runCommitMessagePipeline;
  const commitChanges =
    deps.commitChanges ??
    ((options: { message: string; source: RunPipelineResult["diffSource"] }) => {
      commitWithMessage(options);
    });
  const generateFromRawDiff =
    deps.generateFromRawDiff ??
    (async (options: {
      rawDiff: string;
      maximumTitleLength: number;
      provider: LlmProvider;
    }) => {
      const tracked = createTrackedProvider(options.provider);
      const result = await generateCommitMessage(
        { rawDiff: options.rawDiff, maximumTitleLength: options.maximumTitleLength },
        tracked.provider,
      );
      return {
        commitMessage: result.commitMessage,
        sourceSummaries: result.sourceSummaries,
        llmUsage: tracked.getUsage(),
      };
    });
  const openPullRequest =
    deps.createPullRequest ??
    ((options: { title: string; base: string; body: string }) => {
      createPullRequest({ title: options.title, base: options.base, body: options.body });
    });
  const collectBranchDiffAgainstBase = deps.collectBranchDiff ?? collectBranchDiff;
  const ensureBranchOnOrigin = deps.ensureCurrentBranchOnOrigin ?? ensureCurrentBranchOnOrigin;
  const shouldResolveProvider = deps.runPipeline == null;

  try {
    const completionShell = parseCompletionShell(argv);
    if (completionShell) {
      stdout.write(`${getCompletionScript(completionShell)}\n`);
      return 0;
    }

    const options = parseArgs(argv);
    if (options.help) {
      stdout.write(`${buildHelpText()}\n`);
      return 0;
    }

    let provider: LlmProvider | undefined;
    let maximumTitleLength = DEFAULT_MAXIMUM_TITLE_LENGTH;

    if (shouldResolveProvider) {
      const { config: fileConfig } = loadConfig();
      const runtimeConfig = mergeRuntimeConfig(fileConfig, process.env);
      provider = createProviderFromConfig(runtimeConfig);
      maximumTitleLength = runtimeConfig.maximumTitleLength ?? DEFAULT_MAXIMUM_TITLE_LENGTH;
    }

    const resolvedProvider = provider ?? new MockLlmProvider();
    const totalUsage = emptyUsageMetrics();
    let outputMessage = "";
    let hasOutput = false;

    if (options.commit || !options.pullRequestBase) {
      const result = await runPipeline({
        allowUnstagedFallback: options.allowUnstagedFallback,
        maximumTitleLength,
        provider: resolvedProvider,
      });
      if (!result.hasChanges) {
        stderr.write("No changes detected in staged diff (or unstaged fallback).\n");
        return 1;
      }

      if (options.debug) {
        stderr.write(`[debug] source=${result.diffSource} summaries=${result.sourceSummaries.length}\n`);
      }

      addUsage(totalUsage, result.llmUsage);
      try {
        if (options.commit) {
          await commitChanges({
            message: result.commitMessage,
            source: result.diffSource,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`${formatUsageMetrics(totalUsage)}\n`);
        stderr.write(`Failed to commit changes: ${message}\n`);
        return 1;
      }
      outputMessage = result.commitMessage;
      hasOutput = true;
    }

    if (options.pullRequestBase) {
      try {
        await ensureBranchOnOrigin();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Failed to create pull request: ${message}\n`);
        return 1;
      }

      let branchDiff = "";
      try {
        branchDiff = await collectBranchDiffAgainstBase(options.pullRequestBase);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Failed to create pull request: ${message}\n`);
        return 1;
      }

      if (!branchDiff.trim()) {
        stderr.write(
          `No differences found between current branch and target branch '${options.pullRequestBase}'.\n`,
        );
        return 1;
      }

      let generatedPr: {
        commitMessage: string;
        sourceSummaries: ChunkSummary[];
        llmUsage: LlmUsageMetrics;
      };
      try {
        generatedPr = await generateFromRawDiff({
          rawDiff: branchDiff,
          maximumTitleLength,
          provider: resolvedProvider,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Failed to create pull request: ${message}\n`);
        return 1;
      }

      if (options.debug) {
        stderr.write(
          `[debug] source=branch(${options.pullRequestBase}) summaries=${generatedPr.sourceSummaries.length}\n`,
        );
      }

      addUsage(totalUsage, generatedPr.llmUsage);
      const body = buildPullRequestBody(generatedPr.sourceSummaries);
      try {
        await openPullRequest({
          title: generatedPr.commitMessage,
          base: options.pullRequestBase,
          body,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`${formatUsageMetrics(totalUsage)}\n`);
        stderr.write(`Failed to create pull request: ${message}\n`);
        return 1;
      }
      outputMessage = generatedPr.commitMessage;
      hasOutput = true;
    }

    stderr.write(`${formatUsageMetrics(totalUsage)}\n`);
    if (!hasOutput) {
      return 0;
    }
    stdout.write(`${outputMessage}\n`);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Failed to generate commit message: ${message}\n`);
    return 1;
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Failed to generate commit message: ${message}\n`);
      process.exit(1);
    });
}
