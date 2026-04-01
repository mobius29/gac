import { describe, expect, it } from "vitest";

import { MockLlmProvider } from "../src/llm/mockProvider.js";
import { generateCommitMessage } from "../src/pipeline/generate.js";
import { LOCKFILE_DIFF, SIMPLE_APP_DIFF } from "./fixtures.js";

describe("generateCommitMessage", () => {
  it("returns a conventional commit for meaningful changes", async () => {
    const result = await generateCommitMessage({ rawDiff: SIMPLE_APP_DIFF }, new MockLlmProvider());

    expect(result.commitMessage).toMatch(/^(feat|fix|refactor|docs|test|chore):\s+/);
  });

  it("falls back to safe chore message when all summaries are noise", async () => {
    const result = await generateCommitMessage({ rawDiff: LOCKFILE_DIFF }, new MockLlmProvider());

    expect(result.commitMessage).toBe("chore: update lockfile and generated files");
  });
});
