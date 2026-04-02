import { describe, expect, it } from "vitest";

import { summaryFallbackSubject } from "../src/prompts.js";

describe("summaryFallbackSubject", () => {
  it("rewrites weak past-tense summaries into imperative subjects", () => {
    const subject = summaryFallbackSubject({
      chunkId: "chunk-1",
      filePath: "src/critical.ts",
      whatChanged: "Updated src/critical.ts.",
      whyLikely: "Validation logic changed",
      probableType: "fix",
      importance: 9,
      isNoise: false,
    });

    expect(subject).toBe("update src/critical.ts");
  });

  it("adds an action verb when fallback text is only a file-like token", () => {
    const subject = summaryFallbackSubject({
      chunkId: "chunk-2",
      filePath: "README.md",
      whatChanged: "README.md",
      whyLikely: "Documentation edits",
      probableType: "docs",
      importance: 3,
      isNoise: false,
    });

    expect(subject).toBe("update README.md");
  });
});
