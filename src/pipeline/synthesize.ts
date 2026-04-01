import type { LlmProvider } from "../llm/provider.js";
import { buildSynthesisPrompt } from "../prompts.js";
import type { RankedSummary } from "../types.js";
import { commitSubjectSchema } from "./schemas.js";

function sanitizeSubject(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export async function synthesizeCommitMessage(
  rankedSummaries: RankedSummary[],
  provider: LlmProvider,
): Promise<string> {
  const prompt = buildSynthesisPrompt(rankedSummaries);
  const candidate = sanitizeSubject(await provider.synthesizeCommit(prompt));
  return commitSubjectSchema.parse(candidate);
}
