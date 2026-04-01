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

export function getLatestCommitSubject(
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): string {
  const result = run(runner, ["log", "-1", "--pretty=%s"]);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `git log -1 --pretty=%s failed`;
    throw new Error(`Failed to read latest commit subject: ${detail}`);
  }

  const subject = result.stdout.trim();
  if (subject.length === 0) {
    throw new Error("Latest commit subject is empty");
  }

  return subject;
}

export function getCurrentBranchName(
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): string {
  const result = run(runner, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `git rev-parse --abbrev-ref HEAD failed`;
    throw new Error(`Failed to read current branch: ${detail}`);
  }

  const branch = result.stdout.trim();
  if (branch.length === 0 || branch === "HEAD") {
    throw new Error("Cannot determine current branch name");
  }

  return branch;
}

export function hasRemoteBranch(
  branch: string,
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): boolean {
  const trimmed = branch.trim();
  if (trimmed.length === 0) {
    throw new Error("Branch name must be non-empty");
  }

  const result = run(runner, ["ls-remote", "--exit-code", "--heads", "origin", trimmed]);
  if (result.status === 0) {
    return true;
  }

  // ls-remote exits non-zero when no refs matched.
  if (result.status === 2) {
    return false;
  }

  return false;
}

export function pushBranchToOrigin(
  branch: string,
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): void {
  const trimmed = branch.trim();
  if (trimmed.length === 0) {
    throw new Error("Branch name must be non-empty");
  }

  runGitCommand(runner, ["push", "-u", "origin", trimmed], `push branch ${trimmed} to origin`);
}

export function ensureCurrentBranchOnOrigin(
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): string {
  const branch = getCurrentBranchName(runner);
  if (!hasRemoteBranch(branch, runner)) {
    pushBranchToOrigin(branch, runner);
  }
  return branch;
}

export function collectBranchDiff(
  baseBranch: string,
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): string {
  const trimmedBase = baseBranch.trim();
  if (trimmedBase.length === 0) {
    throw new Error("Target branch must be non-empty");
  }

  return runDiff(runner, ["diff", "--no-ext-diff", `${trimmedBase}...HEAD`]);
}
