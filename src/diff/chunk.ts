import type { DiffChunk, Hunk, PreprocessedFileDiff } from "../types.js";
import { estimateTokens } from "./utils.js";

export interface ChunkingOptions {
  maxChunkTokens: number;
  maxChunkChars: number;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  maxChunkTokens: 1200,
  maxChunkChars: 5000,
};

function hunkToText(hunk: Hunk): string {
  return [hunk.header, ...hunk.lines].join("\n");
}

function splitOversizedText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;

  for (const line of lines) {
    const next = line.length + 1;
    if (size + next > maxChars && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += next;
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

function createChunk(
  id: string,
  file: PreprocessedFileDiff,
  text: string,
  hunkHeader?: string,
): DiffChunk {
  return {
    id,
    filePath: file.path,
    hunkHeader,
    text,
    tokenEstimate: estimateTokens(text),
    noise: file.noise,
    additions: file.additions,
    deletions: file.deletions,
  };
}

export function splitIntoChunks(
  files: PreprocessedFileDiff[],
  options: Partial<ChunkingOptions> = {},
): DiffChunk[] {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const chunks: DiffChunk[] = [];

  for (const file of files) {
    const fileText = file.patchText;
    const fileTokens = estimateTokens(fileText);

    if (fileTokens <= resolved.maxChunkTokens && fileText.length <= resolved.maxChunkChars) {
      chunks.push(createChunk(`${file.path}:file`, file, fileText));
      continue;
    }

    if (file.hunks.length === 0) {
      const parts = splitOversizedText(fileText, resolved.maxChunkChars);
      parts.forEach((part, index) => {
        chunks.push(createChunk(`${file.path}:part-${index + 1}`, file, part));
      });
      continue;
    }

    file.hunks.forEach((hunk, hunkIndex) => {
      const hunkText = hunkToText(hunk);
      const hunkTokens = estimateTokens(hunkText);

      if (hunkTokens <= resolved.maxChunkTokens && hunkText.length <= resolved.maxChunkChars) {
        chunks.push(createChunk(`${file.path}:hunk-${hunkIndex + 1}`, file, hunkText, hunk.header));
        return;
      }

      const parts = splitOversizedText(hunkText, resolved.maxChunkChars);
      parts.forEach((part, partIndex) => {
        chunks.push(
          createChunk(
            `${file.path}:hunk-${hunkIndex + 1}-part-${partIndex + 1}`,
            file,
            part,
            hunk.header,
          ),
        );
      });
    });
  }

  return chunks;
}
