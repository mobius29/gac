import type { FileDiffChunk } from "./splitByFile.js";

export interface SplitByHunkOptions {
  maxChunkChars?: number;
}

const DEFAULT_MAX_CHUNK_CHARS = 3500;
const MIN_BODY_BUDGET = 120;

interface HunkBlock {
  header: string;
  lines: string[];
}

function splitIntoHunks(lines: string[]): HunkBlock[] {
  const hunks: HunkBlock[] = [];
  let current: HunkBlock | undefined;

  for (const line of lines) {
    if (line.startsWith("@@ ")) {
      if (current) {
        hunks.push(current);
      }
      current = { header: line, lines: [line] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    hunks.push(current);
  }

  return hunks;
}

function joinChunkText(fileHeaderLines: string[], hunkLines: string[]): string {
  return [...fileHeaderLines, ...hunkLines].join("\n");
}

function splitLargeHunkBySize(
  fileHeaderLines: string[],
  hunk: HunkBlock,
  maxChunkChars: number,
): string[][] {
  const fixedPrefix = joinChunkText(fileHeaderLines, [hunk.header]);
  const availableBodyChars = Math.max(MIN_BODY_BUDGET, maxChunkChars - fixedPrefix.length - 1);
  const bodyLines = hunk.lines.slice(1);

  if (bodyLines.length === 0) {
    return [[hunk.header]];
  }

  const parts: string[][] = [];
  let currentBodyLines: string[] = [];
  let currentSize = 0;

  for (const bodyLine of bodyLines) {
    const nextSize = bodyLine.length + 1;
    if (currentSize + nextSize > availableBodyChars && currentBodyLines.length > 0) {
      parts.push([hunk.header, ...currentBodyLines]);
      currentBodyLines = [];
      currentSize = 0;
    }
    currentBodyLines.push(bodyLine);
    currentSize += nextSize;
  }

  if (currentBodyLines.length > 0) {
    parts.push([hunk.header, ...currentBodyLines]);
  }

  return parts.length > 0 ? parts : [[hunk.header]];
}

export function splitByHunk(
  fileChunk: FileDiffChunk,
  options: SplitByHunkOptions = {},
): FileDiffChunk[] {
  if (fileChunk.isBinary) {
    return [fileChunk];
  }

  const maxChunkChars = Math.max(MIN_BODY_BUDGET + 80, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);
  const lines = fileChunk.text.split("\n");
  const firstHunkLineIndex = lines.findIndex((line) => line.startsWith("@@ "));

  if (firstHunkLineIndex === -1) {
    return [fileChunk];
  }

  const fileHeaderLines = lines.slice(0, firstHunkLineIndex);
  const hunkLines = lines.slice(firstHunkLineIndex);
  const hunks = splitIntoHunks(hunkLines);

  if (hunks.length === 0) {
    return [fileChunk];
  }

  const chunkTexts: Array<{ text: string; hunkHeader: string }> = [];

  for (const hunk of hunks) {
    const asSingleChunk = joinChunkText(fileHeaderLines, hunk.lines);
    if (asSingleChunk.length <= maxChunkChars) {
      chunkTexts.push({ text: asSingleChunk, hunkHeader: hunk.header });
      continue;
    }

    const splitParts = splitLargeHunkBySize(fileHeaderLines, hunk, maxChunkChars);
    for (const partLines of splitParts) {
      chunkTexts.push({
        text: joinChunkText(fileHeaderLines, partLines),
        hunkHeader: hunk.header,
      });
    }
  }

  return chunkTexts.map((entry, partIndex) => ({
    ...fileChunk,
    id: `${fileChunk.id}:hunk-${partIndex + 1}`,
    text: entry.text,
    partIndex,
    source: "hunk",
    hunkHeader: entry.hunkHeader,
  }));
}
