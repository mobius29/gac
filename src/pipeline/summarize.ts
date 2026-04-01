import type { ChunkSummary, DiffChunk } from "../types.js";
import { buildChunkSummaryPrompt } from "../prompts.js";
import type { LlmProvider } from "../llm/provider.js";
import { chunkSummarySchema } from "./schemas.js";

const MAX_MODEL_SUMMARY_CALLS = 24;
const MAX_SUMMARY_PROMPT_DIFF_CHARS = 2200;

function fallbackSummary(chunk: DiffChunk): ChunkSummary {
  return {
    chunkId: chunk.id,
    filePath: chunk.filePath,
    whatChanged: `Updated ${chunk.filePath}`,
    whyLikely: "Code changes detected",
    probableType: chunk.noise.isNoise ? "chore" : "feat",
    importance: chunk.noise.isNoise ? 1 : Math.min(8, Math.max(3, Math.ceil((chunk.additions + chunk.deletions) / 10))),
    isNoise: chunk.noise.isNoise,
  };
}

function chunkPriorityScore(chunk: DiffChunk): number {
  const lineImpact = chunk.additions + chunk.deletions;
  const hunkBonus = chunk.hunkHeader ? 20 : 0;
  return lineImpact + hunkBonus;
}

function selectChunksForModel(chunks: DiffChunk[]): Set<string> {
  const meaningfulChunks = chunks.filter((chunk) => !chunk.noise.isNoise);
  if (meaningfulChunks.length <= MAX_MODEL_SUMMARY_CALLS) {
    return new Set(meaningfulChunks.map((chunk) => chunk.id));
  }

  const selected = meaningfulChunks
    .slice()
    .sort((left, right) => chunkPriorityScore(right) - chunkPriorityScore(left))
    .slice(0, MAX_MODEL_SUMMARY_CALLS);

  return new Set(selected.map((chunk) => chunk.id));
}

export async function summarizeChunks(chunks: DiffChunk[], provider: LlmProvider): Promise<ChunkSummary[]> {
  const output: ChunkSummary[] = [];
  const selectedChunkIds = selectChunksForModel(chunks);

  for (const chunk of chunks) {
    if (chunk.noise.isNoise || !selectedChunkIds.has(chunk.id)) {
      output.push(fallbackSummary(chunk));
      continue;
    }

    const prompt = buildChunkSummaryPrompt(chunk, {
      maxDiffChars: MAX_SUMMARY_PROMPT_DIFF_CHARS,
    });

    try {
      const raw = await provider.summarizeChunk(prompt);
      const parsed = chunkSummarySchema.parse(JSON.parse(raw));

      output.push({
        chunkId: chunk.id,
        filePath: chunk.filePath,
        whatChanged: parsed.whatChanged,
        whyLikely: parsed.whyLikely,
        probableType: parsed.probableType,
        importance: parsed.importance,
        isNoise: parsed.isNoise || chunk.noise.isNoise,
      });
    } catch {
      output.push(fallbackSummary(chunk));
    }
  }

  return output;
}
