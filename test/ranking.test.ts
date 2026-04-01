import { describe, expect, it } from "vitest";

import { rankSummaries } from "../src/pipeline/ranking.js";

describe("rankSummaries", () => {
  it("deprioritizes noise and prefers meaningful changes", () => {
    const ranked = rankSummaries([
      {
        chunkId: "1",
        filePath: "pnpm-lock.yaml",
        whatChanged: "Updated lockfile",
        whyLikely: "Dependency refresh",
        probableType: "chore",
        importance: 8,
        isNoise: true,
      },
      {
        chunkId: "2",
        filePath: "src/auth.ts",
        whatChanged: "Fix token validation",
        whyLikely: "Bug fix",
        probableType: "fix",
        importance: 6,
        isNoise: false,
      },
    ]);

    expect(ranked[0].filePath).toBe("src/auth.ts");
  });
});
