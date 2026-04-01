import { describe, expect, it } from "vitest";

import { buildSummarizeChunkPrompt, buildSynthesizeCommitPrompt } from "../../src/llm/prompts.js";

describe("llm prompt builders", () => {
  it("builds summarize prompt with required metadata and truncation", () => {
    const prompt = buildSummarizeChunkPrompt(
      {
        filePath: "src/app.ts",
        additions: 12,
        deletions: 4,
        noise: { isNoise: false, confidence: 0.9 },
        text: "x".repeat(80),
      },
      { maxDiffChars: 10 },
    );

    expect(prompt).toContain("FILE_PATH: src/app.ts");
    expect(prompt).toContain("ADDITIONS: 12");
    expect(prompt).toContain("DELETIONS: 4");
    expect(prompt).toContain("NOISE: false");
    expect(prompt).toContain("...<truncated>");
  });

  it("builds synthesis prompt from ranked summaries", () => {
    const prompt = buildSynthesizeCommitPrompt([
      {
        rankScore: 9.234,
        filePath: "src/app.ts",
        whatChanged: "Add retry logic.",
        probableType: "feat",
      },
      {
        rankScore: 5.1,
        filePath: "test/app.test.ts",
        whatChanged: "Update tests",
        probableType: "test",
      },
    ]);

    expect(prompt).toContain("TOP_TYPE: feat");
    expect(prompt).toContain("TOP_SUBJECT: add retry logic");
    expect(prompt).toContain("- [9.23] src/app.ts: Add retry logic.");
  });
});
