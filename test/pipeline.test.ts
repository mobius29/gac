import { describe, expect, it } from "vitest";

import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "../src/llm/provider.js";
import { MockLlmProvider } from "../src/llm/mockProvider.js";
import { generateCommitMessage } from "../src/pipeline/generate.js";
import { LOCKFILE_DIFF, SIMPLE_APP_DIFF } from "./fixtures.js";

class LongSubjectProvider implements LlmProvider {
  async generate(_request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    return { text: "" };
  }

  async summarizeChunk(): Promise<string> {
    return JSON.stringify({
      whatChanged: "Implement robust parsing and ranking improvements",
      whyLikely: "Core behavior changed",
      probableType: "feat",
      importance: 9,
      isNoise: false,
    });
  }

  async synthesizeCommit(): Promise<string> {
    return "feat: implement robust parsing and ranking improvements for multi-repository workflows";
  }
}

describe("generateCommitMessage", () => {
  it("returns a conventional commit for meaningful changes", async () => {
    const result = await generateCommitMessage({ rawDiff: SIMPLE_APP_DIFF }, new MockLlmProvider());

    expect(result.commitMessage).toMatch(/^(feat|fix|refactor|docs|test|chore):\s+/);
  });

  it("falls back to safe chore message when all summaries are noise", async () => {
    const result = await generateCommitMessage({ rawDiff: LOCKFILE_DIFF }, new MockLlmProvider());

    expect(result.commitMessage).toBe("chore: update lockfile and generated files");
  });

  it("enforces maximum title length on the final subject", async () => {
    const result = await generateCommitMessage(
      { rawDiff: SIMPLE_APP_DIFF, maximumTitleLength: 50 },
      new LongSubjectProvider(),
    );

    expect(result.commitMessage.length).toBeLessThanOrEqual(50);
    expect(result.commitMessage).toMatch(/^(feat|fix|refactor|docs|test|chore):\s+/);
  });
});
