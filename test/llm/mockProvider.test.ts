import { describe, expect, it } from "vitest";

import { MockLlmProvider } from "../../src/llm/mockProvider.js";
import { buildSummarizeChunkPrompt, buildSynthesizeCommitPrompt } from "../../src/llm/prompts.js";

describe("MockLlmProvider", () => {
  it("returns deterministic summarize output", async () => {
    const provider = new MockLlmProvider();
    const prompt = buildSummarizeChunkPrompt({
      filePath: "src/service.ts",
      additions: 6,
      deletions: 1,
      noise: { isNoise: false, confidence: 0.8 },
      text: "@@ -1,1 +1,7 @@",
    });

    const first = await provider.summarizeChunk(prompt);
    const second = await provider.summarizeChunk(prompt);

    expect(first).toBe(second);
    expect(JSON.parse(first)).toMatchObject({
      probableType: "feat",
      isNoise: false,
    });
  });

  it("supports the generic generate API", async () => {
    const provider = new MockLlmProvider();
    const prompt = buildSynthesizeCommitPrompt([
      {
        rankScore: 8.1,
        filePath: "src/fix.ts",
        whatChanged: "Fix timeout handling.",
        probableType: "fix",
      },
    ]);

    const result = await provider.generate({
      task: "synthesize_commit",
      prompt,
      responseFormat: "text",
    });

    expect(result.text).toBe("fix: fix timeout handling");
  });
});
