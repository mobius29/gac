import { describe, expect, it } from "vitest";

import type { LlmGenerateRequest, LlmGenerateResponse, LlmTextProvider } from "../../src/llm/provider.js";
import { MockLlmProvider } from "../../src/llm/mockProvider.js";
import { summarizeChunk } from "../../src/llm/summarizeChunk.js";
import { synthesizeCommit } from "../../src/llm/synthesizeCommit.js";

class StaticProvider implements LlmTextProvider {
  private readonly output: string;

  constructor(output: string) {
    this.output = output;
  }

  async generate(_request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    return { text: this.output };
  }
}

describe("llm wrappers", () => {
  it("summarizeChunk returns parsed structured output from provider", async () => {
    const provider = new MockLlmProvider();

    const summary = await summarizeChunk(
      {
        filePath: "test/unit/app.test.ts",
        additions: 10,
        deletions: 2,
        noise: { isNoise: false, confidence: 0.8 },
        text: "@@ -1,0 +1,12 @@",
      },
      provider,
    );

    expect(summary.probableType).toBe("test");
    expect(summary.importance).toBeGreaterThanOrEqual(1);
    expect(summary.importance).toBeLessThanOrEqual(10);
  });

  it("summarizeChunk throws a clear error for non-json output", async () => {
    const provider = new StaticProvider("not-json");

    await expect(
      summarizeChunk(
        {
          filePath: "src/app.ts",
          additions: 1,
          deletions: 1,
          noise: { isNoise: false, confidence: 0.5 },
          text: "diff --git a/src/app.ts b/src/app.ts",
        },
        provider,
      ),
    ).rejects.toThrow(/Invalid summarize_chunk JSON response/);
  });

  it("synthesizeCommit validates conventional commit shape", async () => {
    const provider = new MockLlmProvider();

    const subject = await synthesizeCommit(
      [
        {
          rankScore: 9.5,
          filePath: "src/retry.ts",
          whatChanged: "Add retry strategy.",
          probableType: "feat",
        },
      ],
      provider,
    );

    expect(subject).toBe("feat: add retry strategy");
  });

  it("synthesizeCommit rejects invalid commit subjects", async () => {
    const provider = new StaticProvider("update files");

    await expect(
      synthesizeCommit(
        [
          {
            rankScore: 3,
            filePath: "README.md",
            whatChanged: "Update docs",
            probableType: "docs",
          },
        ],
        provider,
      ),
    ).rejects.toThrow(/Conventional Commit subject/i);
  });
});
