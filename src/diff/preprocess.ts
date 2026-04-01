import type { Hunk, ParsedFileDiff, PreprocessedFileDiff } from "../types.js";
import { detectNoise } from "./noise.js";
import { normalizePath } from "./utils.js";

interface FilePatchBuilder {
  patchLines: string[];
  headerOldPath?: string;
  headerNewPath?: string;
  oldPath?: string;
  newPath?: string;
  isBinary: boolean;
  hunks: Hunk[];
  currentHunk?: Hunk;
  additions: number;
  deletions: number;
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
  return normalizePath(trimmed);
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

function finalizeFilePatch(builder: FilePatchBuilder): ParsedFileDiff {
  if (builder.currentHunk) {
    builder.hunks.push(builder.currentHunk);
  }

  const path = resolvePath(builder.newPath, builder.oldPath, builder.headerNewPath, builder.headerOldPath);
  const oldPath = builder.oldPath ?? builder.headerOldPath;
  const normalizedOldPath =
    oldPath && oldPath !== "/dev/null" ? oldPath : oldPath === "/dev/null" ? "/dev/null" : undefined;

  return {
    path,
    oldPath: normalizedOldPath,
    isBinary: builder.isBinary,
    hunks: builder.hunks,
    additions: builder.additions,
    deletions: builder.deletions,
    patchText: builder.patchLines.join("\n"),
  };
}

export function parseUnifiedDiff(rawDiff: string): ParsedFileDiff[] {
  if (!rawDiff.trim()) {
    return [];
  }

  const lines = rawDiff.split(/\r?\n/);
  const files: ParsedFileDiff[] = [];
  let current: FilePatchBuilder | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        files.push(finalizeFilePatch(current));
      }
      const { oldPath, newPath } = parseDiffHeaderPaths(line);
      current = {
        patchLines: [line],
        headerOldPath: oldPath,
        headerNewPath: newPath,
        oldPath,
        newPath,
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    current.patchLines.push(line);

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

    if (line.startsWith("@@ ")) {
      if (current.currentHunk) {
        current.hunks.push(current.currentHunk);
      }
      current.currentHunk = { header: line, lines: [] };
      continue;
    }

    if (current.currentHunk) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        current.additions += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.deletions += 1;
      }
      current.currentHunk.lines.push(line);
    }
  }

  if (current) {
    files.push(finalizeFilePatch(current));
  }

  return files;
}

export function preprocessDiff(rawDiff: string): PreprocessedFileDiff[] {
  const files = parseUnifiedDiff(rawDiff);
  return files.map((file) => ({
    ...file,
    noise: detectNoise(file.path, file.isBinary, file.patchText),
  }));
}
