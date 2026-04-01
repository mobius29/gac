import { spawnSync } from "node:child_process";

export type DiffSource = "staged" | "unstaged";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  status: number;
}

export interface GitCommandRunner {
  run(args: string[]): GitCommandResult;
}

export interface CollectGitDiffOptions {
  allowUnstagedFallback?: boolean;
}

export interface DiffFileMetadata {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface DiffMetadata {
  changedFiles: string[];
  additions: number;
  deletions: number;
  binaryFiles: string[];
  files: DiffFileMetadata[];
}

export interface CollectedGitDiff {
  source: DiffSource;
  rawDiff: string;
  metadata: DiffMetadata;
}

const STAGED_DIFF_ARGS = ["diff", "--cached", "--no-ext-diff"];
const UNSTAGED_DIFF_ARGS = ["diff", "--no-ext-diff"];

interface DiffMetadataBuilder {
  headerOldPath?: string;
  headerNewPath?: string;
  oldPath?: string;
  newPath?: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

class DefaultGitCommandRunner implements GitCommandRunner {
  run(args: string[]): GitCommandResult {
    const result = spawnSync("git", args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });

    if (result.error) {
      throw result.error;
    }

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      status: result.status ?? 1,
    };
  }
}

export class GitCommandError extends Error {
  readonly args: string[];
  readonly status: number;
  readonly stderr: string;

  constructor(args: string[], status: number, stderr: string) {
    const trimmed = stderr.trim();
    const message = trimmed.length > 0 ? trimmed : `git ${args.join(" ")} failed with status ${status}`;
    super(message);
    this.name = "GitCommandError";
    this.args = args;
    this.status = status;
    this.stderr = stderr;
  }
}

function runGitDiff(runner: GitCommandRunner, args: string[]): string {
  const result = runner.run(args);
  if (result.status !== 0) {
    throw new GitCommandError(args, result.status, result.stderr);
  }
  return result.stdout;
}

function unquotePath(input: string): string {
  if (input.startsWith('"') && input.endsWith('"')) {
    const unquoted = input.slice(1, -1);
    return unquoted.replace(/\\(["\\])/g, "$1");
  }
  return input;
}

function normalizeDiffPath(pathCandidate: string): string {
  const trimmed = unquotePath(pathCandidate.trim());
  if (trimmed === "/dev/null") {
    return "/dev/null";
  }
  return trimmed.replace(/^a\//, "").replace(/^b\//, "");
}

function splitGitHeaderTokens(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let inQuotes = false;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      token += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      token += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      token += char;
      inQuotes = !inQuotes;
      continue;
    }

    if (char === " " && !inQuotes) {
      if (token.length > 0) {
        tokens.push(token);
        token = "";
      }
      continue;
    }

    token += char;
  }

  if (token.length > 0) {
    tokens.push(token);
  }

  return tokens;
}

function parseDiffHeaderPaths(line: string): { oldPath?: string; newPath?: string } {
  const rest = line.slice("diff --git ".length).trim();
  if (!rest) {
    return {};
  }

  const tokens = splitGitHeaderTokens(rest);
  if (tokens.length < 2) {
    return {};
  }

  return {
    oldPath: normalizeDiffPath(tokens[0]),
    newPath: normalizeDiffPath(tokens[1]),
  };
}

function resolvePath(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate || candidate === "/dev/null") {
      continue;
    }
    return candidate;
  }
  return "unknown";
}

function finalizeFileMetadata(current: DiffMetadataBuilder): DiffFileMetadata {
  const path = resolvePath(current.newPath, current.oldPath, current.headerNewPath, current.headerOldPath);
  const oldPath = current.oldPath ?? current.headerOldPath;
  return {
    path,
    oldPath: oldPath === "/dev/null" ? undefined : oldPath,
    additions: current.additions,
    deletions: current.deletions,
    isBinary: current.isBinary,
  };
}

export function collectDiffMetadata(rawDiff: string): DiffMetadata {
  if (!rawDiff.trim()) {
    return {
      changedFiles: [],
      additions: 0,
      deletions: 0,
      binaryFiles: [],
      files: [],
    };
  }

  const files: DiffFileMetadata[] = [];
  const lines = rawDiff.split(/\r?\n/);
  let current: DiffMetadataBuilder | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        files.push(finalizeFileMetadata(current));
      }

      const { oldPath, newPath } = parseDiffHeaderPaths(line);
      current = {
        headerOldPath: oldPath,
        headerNewPath: newPath,
        oldPath,
        newPath,
        additions: 0,
        deletions: 0,
        isBinary: false,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      current.isBinary = true;
      continue;
    }

    if (line.startsWith("rename from ")) {
      current.oldPath = normalizeDiffPath(line.slice("rename from ".length));
      continue;
    }

    if (line.startsWith("rename to ")) {
      current.newPath = normalizeDiffPath(line.slice("rename to ".length));
      continue;
    }

    if (line.startsWith("copy from ")) {
      current.oldPath = normalizeDiffPath(line.slice("copy from ".length));
      continue;
    }

    if (line.startsWith("copy to ")) {
      current.newPath = normalizeDiffPath(line.slice("copy to ".length));
      continue;
    }

    if (line.startsWith("new file mode ")) {
      current.oldPath = "/dev/null";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      current.newPath = "/dev/null";
      continue;
    }

    if (line.startsWith("--- ")) {
      current.oldPath = normalizeDiffPath(line.slice(4));
      continue;
    }

    if (line.startsWith("+++ ")) {
      current.newPath = normalizeDiffPath(line.slice(4));
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
    }
  }

  if (current) {
    files.push(finalizeFileMetadata(current));
  }

  return {
    changedFiles: files.map((file) => file.path),
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    binaryFiles: files.filter((file) => file.isBinary).map((file) => file.path),
    files,
  };
}

export function collectGitDiff(
  options: CollectGitDiffOptions = {},
  runner: GitCommandRunner = new DefaultGitCommandRunner(),
): CollectedGitDiff {
  const allowUnstagedFallback = options.allowUnstagedFallback ?? true;
  const stagedDiff = runGitDiff(runner, STAGED_DIFF_ARGS);

  if (stagedDiff.trim().length > 0 || !allowUnstagedFallback) {
    return {
      source: "staged",
      rawDiff: stagedDiff,
      metadata: collectDiffMetadata(stagedDiff),
    };
  }

  const unstagedDiff = runGitDiff(runner, UNSTAGED_DIFF_ARGS);
  return {
    source: "unstaged",
    rawDiff: unstagedDiff,
    metadata: collectDiffMetadata(unstagedDiff),
  };
}
