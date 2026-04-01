#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { DEFAULT_MAXIMUM_TITLE_LENGTH, loadConfig, type AppConfig } from "./config/load.js";
import { commitWithMessage } from "./git.js";
import { createProviderFromConfig } from "./llm/factory.js";
import type { LlmProvider } from "./llm/provider.js";
import { runCommitMessagePipeline, type RunPipelineResult } from "./pipeline/run.js";

interface CliOptions {
  allowUnstagedFallback: boolean;
  commit: boolean;
  debug: boolean;
  help: boolean;
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
    openaiApiKey: firstNonEmpty(env.OPENAI_API_KEY, fileConfig.openaiApiKey),
    openaiModel: firstNonEmpty(env.OPENAI_MODEL, fileConfig.openaiModel),
    openaiBaseUrl: firstNonEmpty(env.OPENAI_BASE_URL, fileConfig.openaiBaseUrl),
    maximumTitleLength,
  };
}

export function parseArgs(argv: string[]): CliOptions {
  return {
    allowUnstagedFallback: !argv.includes("--no-unstaged-fallback"),
    commit: argv.includes("--commit"),
    debug: argv.includes("--debug"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function buildHelpText(): string {
  return [
    "Usage: gac [options]",
    "",
    "Options:",
    "  -h, --help                 Show this help message and exit",
    "      --commit               Commit with the generated message",
    "      --debug                Print pipeline debug metadata to stderr",
    "      --no-unstaged-fallback Only read staged diff; do not fallback to unstaged diff",
  ].join("\n");
}

function formatUsageMetrics(result: RunPipelineResult): string {
  return `LLM usage: requests=${result.llmUsage.requestCount} tokens=${result.llmUsage.totalTokens} (prompt=${result.llmUsage.promptTokens}, completion=${result.llmUsage.completionTokens})`;
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const options = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const runPipeline = deps.runPipeline ?? runCommitMessagePipeline;
  const commitChanges =
    deps.commitChanges ??
    ((options: { message: string; source: RunPipelineResult["diffSource"] }) => {
      commitWithMessage(options);
    });
  const shouldResolveProvider = deps.runPipeline == null;

  if (options.help) {
    stdout.write(`${buildHelpText()}\n`);
    return 0;
  }

  try {
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
