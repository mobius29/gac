#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { runCommitMessagePipeline, type RunPipelineResult } from "./pipeline/run.js";

interface CliOptions {
  allowUnstagedFallback: boolean;
  debug: boolean;
}

export interface CliDeps {
  runPipeline?: (options: { allowUnstagedFallback: boolean }) => Promise<RunPipelineResult>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

export function parseArgs(argv: string[]): CliOptions {
  return {
    allowUnstagedFallback: !argv.includes("--no-unstaged-fallback"),
    debug: argv.includes("--debug"),
  };
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const options = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const runPipeline = deps.runPipeline ?? runCommitMessagePipeline;

  try {
    const result = await runPipeline({ allowUnstagedFallback: options.allowUnstagedFallback });
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
