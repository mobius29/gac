import type { RankedSummary } from "../types.js";
import { buildSynthesizeCommitPrompt } from "./prompts.js";
import type { LlmTextProvider } from "./provider.js";
import { commitSubjectSchema } from "./schemas.js";

function sanitizeSubject(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export async function synthesizeCommit(
  rankedSummaries: Pick<RankedSummary, "rankScore" | "filePath" | "whatChanged" | "probableType">[],
  provider: LlmTextProvider,
): Promise<string> {
  const prompt = buildSynthesizeCommitPrompt(rankedSummaries);
  const response = await provider.generate({
    task: "synthesize_commit",
    prompt,
    responseFormat: "text",
  });

  return commitSubjectSchema.parse(sanitizeSubject(response.text));
}
