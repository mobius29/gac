import { spawnSync } from "node:child_process";

import type { CollectedDiff, DiffSource, GitDiffCollectionOptions } from "./types.js";

export interface GitCommandRunner {
  run(args: string[]): { stdout: string; stderr: string; status: number };
}

class DefaultGitCommandRunner implements GitCommandRunner {
  run(args: string[]) {
    const result = spawnSync("git", args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      status: result.status ?? 1,
    };
  }
}

function runDiff(runner: GitCommandRunner, args: string[]): string {
  const result = runner.run(args);
  if (result.status !== 0) {
    const message = result.stderr.trim() || `git ${args.join(" ")} failed`;
    throw new Error(message);
  }
  return result.stdout;
}

function run(runner: GitCommandRunner, args: string[]) {
  return runner.run(args);
}

function runGitCommand(runner: GitCommandRunner, args: string[], purpose: string): void {
  const result = runner.run(args);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `git ${args.join(" ")} failed`;
    throw new Error(`Failed to ${purpose}: ${detail}`);
  }
}

function isCachedOptionError(stderr: string): boolean {
  return /unknown option ['`"]?cached['`"]?/i.test(stderr);
}

function hasHeadCommit(runner: GitCommandRunner): boolean {
  const result = run(runner, ["rev-parse", "--verify", "HEAD"]);
  return result.status === 0;
}

function collectStagedWithFallback(runner: GitCommandRunner): string {
  try {
    return runDiff(runner, ["diff", "--cached", "--no-ext-diff"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isCachedOptionError(message)) {
      throw error;
    }
  }

  if (hasHeadCommit(runner)) {
    return runDiff(runner, ["diff-index", "--cached", "--patch", "--no-ext-diff", "--root", "HEAD", "--"]);
  }

  // Empty tree object for repos without an initial commit.
  return runDiff(runner, [
    "diff-index",
    "--cached",
    "--patch",
    "--no-ext-diff",
    "--root",
    "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    "--",
  ]);
}

function collectUnstagedWithFallback(runner: GitCommandRunner): string {
  try {
    return runDiff(runner, ["diff", "--no-ext-diff"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isCachedOptionError(message)) {
      throw error;
    }
  }

  return runDiff(runner, ["diff-files", "--patch", "--no-ext-diff", "--"]);
}

export function collectGitDiff(
  options: GitDiffCollectionOptions,
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): CollectedDiff {
  const staged = collectStagedWithFallback(runner);

  if (staged.trim().length > 0) {
    return {
      source: "staged",
      rawDiff: staged,
    };
  }

  if (!options.allowUnstagedFallback) {
    return {
      source: "staged",
      rawDiff: "",
    };
  }

  const unstaged = collectUnstagedWithFallback(runner);
  return {
    source: "unstaged",
    rawDiff: unstaged,
  };
}

export interface CommitWithMessageOptions {
  message: string;
  source: DiffSource;
}

export function commitWithMessage(
  options: CommitWithMessageOptions,
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): void {
  const message = options.message.trim();
  if (message.length === 0) {
    throw new Error("Cannot commit with an empty message");
  }

  if (options.source === "unstaged") {
    // Stage tracked changes that were used to generate the message.
    runGitCommand(runner, ["add", "-u"], "stage tracked unstaged changes");
  }

  runGitCommand(runner, ["commit", "-m", message], "create commit");
}
