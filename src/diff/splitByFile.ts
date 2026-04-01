import { splitByHunk } from "./splitByHunk.js";

export interface FileDiffChunk {
  id: string;
  filePath: string;
  text: string;
  fileIndex: number;
  partIndex: number;
  source: "file" | "hunk";
  isBinary: boolean;
  hunkHeader?: string;
}

export interface SplitByFileOptions {
  maxFileChars?: number;
  maxHunkChars?: number;
}

const DEFAULT_MAX_FILE_CHARS = 5000;
const DIFF_FILE_HEADER_PREFIX = "diff --git ";

function normalizeLineEndings(rawDiff: string): string {
  return rawDiff.replace(/\r\n/g, "\n");
}

function stripWrappingQuotes(token: string): string {
  if (token.length < 2) {
    return token;
  }

  const startsWithDouble = token.startsWith("\"");
  const endsWithDouble = token.endsWith("\"");
  if (startsWithDouble && endsWithDouble) {
    return token.slice(1, -1);
  }

  const startsWithSingle = token.startsWith("'");
  const endsWithSingle = token.endsWith("'");
  if (startsWithSingle && endsWithSingle) {
    return token.slice(1, -1);
  }

  return token;
}

function normalizePathToken(token: string): string | undefined {
  const trimmed = stripWrappingQuotes(token.trim());
  if (!trimmed || trimmed === "/dev/null") {
    return undefined;
  }

  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    return trimmed.slice(2);
  }

  return trimmed;
}

function extractPathFromDiffHeader(line: string): string | undefined {
  if (!line.startsWith(DIFF_FILE_HEADER_PREFIX)) {
    return undefined;
  }

  const payload = line.slice(DIFF_FILE_HEADER_PREFIX.length).trim();

  const quoted = payload.match(/^"a\/(.+)"\s+"b\/(.+)"$/);
  if (quoted?.[2]) {
    return quoted[2];
  }

  const unquoted = payload.match(/^a\/(\S+)\s+b\/(\S+)$/);
  if (unquoted?.[2]) {
    return unquoted[2];
  }

  const marker = " b/";
  const markerIndex = payload.indexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }

  const right = payload.slice(markerIndex + 1).trim();
  return normalizePathToken(right);
}

function extractPathFromPatchLines(lines: string[]): string | undefined {
  const preferredPrefixes = ["+++ ", "--- "];
  for (const prefix of preferredPrefixes) {
    const match = lines.find((line) => line.startsWith(prefix));
    if (!match) {
      continue;
    }

    const pathCandidate = normalizePathToken(match.slice(prefix.length));
    if (pathCandidate) {
      return pathCandidate;
    }
  }

  return undefined;
}

function isBinaryPatch(lines: string[]): boolean {
  return lines.some(
    (line) =>
      line.startsWith("Binary files ") ||
      line.startsWith("Binary file ") ||
      line === "GIT binary patch",
  );
}

function splitRawDiffIntoFileSections(rawDiff: string): string[][] {
  const lines = normalizeLineEndings(rawDiff).split("\n");
  const sections: string[][] = [];
  const preamble: string[] = [];
  let current: string[] | undefined;

  for (const line of lines) {
    if (line.startsWith(DIFF_FILE_HEADER_PREFIX)) {
      if (current) {
        sections.push(current);
      }
      current = [line];
      continue;
    }

    if (current) {
      current.push(line);
      continue;
    }

    if (line.length > 0 || preamble.length > 0) {
      preamble.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  if (sections.length === 0) {
    return preamble.length > 0 ? [preamble] : [];
  }

  if (preamble.length > 0) {
    sections[0] = [...preamble, ...sections[0]];
  }

  return sections;
}

function buildFileChunk(sectionLines: string[], fileIndex: number): FileDiffChunk {
  const diffHeader = sectionLines.find((line) => line.startsWith(DIFF_FILE_HEADER_PREFIX));
  const filePath =
    (diffHeader ? extractPathFromDiffHeader(diffHeader) : undefined) ??
    extractPathFromPatchLines(sectionLines) ??
    `unknown-${fileIndex + 1}`;

  return {
    id: `${filePath}:file-${fileIndex + 1}`,
    filePath,
    text: sectionLines.join("\n"),
    fileIndex,
    partIndex: 0,
    source: "file",
    isBinary: isBinaryPatch(sectionLines),
  };
}

export function splitByFile(rawDiff: string): FileDiffChunk[] {
  if (!rawDiff.trim()) {
    return [];
  }

  const sections = splitRawDiffIntoFileSections(rawDiff);
  return sections.map(buildFileChunk);
}

export function splitDiffForSummarization(
  rawDiff: string,
  options: SplitByFileOptions = {},
): FileDiffChunk[] {
  const maxFileChars = options.maxFileChars ?? DEFAULT_MAX_FILE_CHARS;
  const fileChunks = splitByFile(rawDiff);
  const output: FileDiffChunk[] = [];

  for (const fileChunk of fileChunks) {
    if (fileChunk.isBinary || fileChunk.text.length <= maxFileChars) {
      output.push(fileChunk);
      continue;
    }

    output.push(...splitByHunk(fileChunk, { maxChunkChars: options.maxHunkChars ?? maxFileChars }));
  }

  return output;
}
