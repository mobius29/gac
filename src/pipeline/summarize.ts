import type { ChunkSummary, DiffChunk } from "../types.js";
import { buildChunkSummaryPrompt } from "../prompts.js";
import type { LlmProvider } from "../llm/provider.js";
import { chunkSummarySchema } from "./schemas.js";

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

export async function summarizeChunks(chunks: DiffChunk[], provider: LlmProvider): Promise<ChunkSummary[]> {
  const output: ChunkSummary[] = [];

  for (const chunk of chunks) {
    const prompt = buildChunkSummaryPrompt(chunk);

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
