import type { DiffChunk } from "../types.js";
import { buildSummarizeChunkPrompt } from "./prompts.js";
import type { LlmTextProvider } from "./provider.js";
import { chunkSummarySchema, type ChunkSummaryModelOutput } from "./schemas.js";

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractJsonText(rawText: string): string {
  const withoutFences = stripCodeFences(rawText);

  if (withoutFences.startsWith("{") && withoutFences.endsWith("}")) {
    return withoutFences;
  }

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Provider did not return a JSON object for summarize_chunk");
  }
  return withoutFences.slice(start, end + 1);
}

export async function summarizeChunk(
  chunk: Pick<DiffChunk, "filePath" | "additions" | "deletions" | "noise" | "text">,
  provider: LlmTextProvider,
): Promise<ChunkSummaryModelOutput> {
  const prompt = buildSummarizeChunkPrompt(chunk);
  const response = await provider.generate({
    task: "summarize_chunk",
    prompt,
    responseFormat: "json",
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(response.text));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new Error(`Invalid summarize_chunk JSON response: ${message}`);
  }

  return chunkSummarySchema.parse(parsed);
}
