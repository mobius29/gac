#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { DEFAULT_MAXIMUM_TITLE_LENGTH, loadConfig, type AppConfig } from "./config/load.js";
import { createPullRequest } from "./gh.js";
import { commitWithMessage } from "./git.js";
import { createProviderFromConfig } from "./llm/factory.js";
import type { LlmProvider } from "./llm/provider.js";
import { runCommitMessagePipeline, type RunPipelineResult } from "./pipeline/run.js";

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
  commitChanges?: (options: {
    message: string;
    source: RunPipelineResult["diffSource"];
  }) => void | Promise<void>;
  createPullRequest?: (options: { title: string; base: string }) => void | Promise<void>;
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
    "      --debug                Print pipeline debug metadata to stderr",
    "      --no-unstaged-fallback Only read staged diff; do not fallback to unstaged diff",
  ].join("\n");
}

function formatUsageMetrics(result: RunPipelineResult): string {
  return `LLM usage: requests=${result.llmUsage.requestCount} tokens=${result.llmUsage.totalTokens} (prompt=${result.llmUsage.promptTokens}, completion=${result.llmUsage.completionTokens})`;
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
  const openPullRequest =
    deps.createPullRequest ??
    ((options: { title: string; base: string }) => {
      createPullRequest({ title: options.title, base: options.base });
    });
  const shouldResolveProvider = deps.runPipeline == null;

  try {
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

    const result = await runPipeline({
      allowUnstagedFallback: options.allowUnstagedFallback,
      maximumTitleLength,
      provider,
    });
    if (!result.hasChanges) {
      stderr.write("No changes detected in staged diff (or unstaged fallback).\n");
      return 1;
    }

    if (options.debug) {
      stderr.write(`[debug] source=${result.diffSource} summaries=${result.sourceSummaries.length}\n`);
    }
    stderr.write(`${formatUsageMetrics(result)}\n`);

    if (options.commit) {
      try {
        await commitChanges({
          message: result.commitMessage,
          source: result.diffSource,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Failed to commit changes: ${message}\n`);
        return 1;
      }
    }

    if (options.pullRequestBase) {
      try {
        await openPullRequest({ title: result.commitMessage, base: options.pullRequestBase });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`Failed to create pull request: ${message}\n`);
        return 1;
      }
    }

    stdout.write(`${result.commitMessage}\n`);
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
