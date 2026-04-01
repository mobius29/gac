#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { loadConfig, type AppConfig } from "./config/load.js";
import { createProviderFromConfig } from "./llm/factory.js";
import type { LlmProvider } from "./llm/provider.js";
import { runCommitMessagePipeline, type RunPipelineResult } from "./pipeline/run.js";

interface CliOptions {
  allowUnstagedFallback: boolean;
  debug: boolean;
  help: boolean;
}

export interface CliDeps {
  runPipeline?: (options: {
    allowUnstagedFallback: boolean;
    provider?: LlmProvider;
  }) => Promise<RunPipelineResult>;
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

function mergeRuntimeConfig(fileConfig: AppConfig, env: NodeJS.ProcessEnv): AppConfig {
  return {
    llmProvider: firstNonEmpty(
      env.GIT_AUTO_COMMIT_LLM_PROVIDER,
      env.LLM_PROVIDER,
      fileConfig.llmProvider,
    ),
    openaiApiKey: firstNonEmpty(env.OPENAI_API_KEY, fileConfig.openaiApiKey),
    openaiModel: firstNonEmpty(env.OPENAI_MODEL, fileConfig.openaiModel),
    openaiBaseUrl: firstNonEmpty(env.OPENAI_BASE_URL, fileConfig.openaiBaseUrl),
  };
}

export function parseArgs(argv: string[]): CliOptions {
  return {
    allowUnstagedFallback: !argv.includes("--no-unstaged-fallback"),
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
    "      --debug                Print pipeline debug metadata to stderr",
    "      --no-unstaged-fallback Only read staged diff; do not fallback to unstaged diff",
  ].join("\n");
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const options = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const runPipeline = deps.runPipeline ?? runCommitMessagePipeline;
  const shouldResolveProvider = deps.runPipeline == null;

  if (options.help) {
    stdout.write(`${buildHelpText()}\n`);
    return 0;
  }

  try {
    let provider: LlmProvider | undefined;

    if (shouldResolveProvider) {
      const { config: fileConfig } = loadConfig();
      const runtimeConfig = mergeRuntimeConfig(fileConfig, process.env);
      provider = createProviderFromConfig(runtimeConfig);
    }

    const result = await runPipeline({
      allowUnstagedFallback: options.allowUnstagedFallback,
      provider,
    });
    if (!result.hasChanges) {
      stderr.write("No changes detected in staged diff (or unstaged fallback).\n");
      return 1;
    }

    if (options.debug) {
      stderr.write(`[debug] source=${result.diffSource} summaries=${result.sourceSummaries.length}\n`);
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
