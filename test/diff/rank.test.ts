import { describe, expect, it } from "vitest";

import { filterForSynthesis, rankSummaries, selectTopSummary } from "../../src/diff/rank.js";
import type { ChunkSummary } from "../../src/types.js";

function summary(overrides: Partial<ChunkSummary>): ChunkSummary {
  return {
    chunkId: "chunk-1",
    filePath: "src/example.ts",
    whatChanged: "Updated example",
    whyLikely: "Refactor implementation details",
    probableType: "refactor",
    importance: 5,
    isNoise: false,
    ...overrides,
  };
}

describe("rankSummaries", () => {
  it("de-emphasizes noise even when noise has high raw importance", () => {
    const ranked = rankSummaries([
      summary({
        chunkId: "noise-1",
        filePath: "pnpm-lock.yaml",
        probableType: "chore",
        importance: 10,
        isNoise: true,
      }),
      summary({
        chunkId: "meaningful-1",
        filePath: "src/auth.ts",
        probableType: "fix",
        importance: 6,
        isNoise: false,
      }),
    ]);

    expect(ranked[0].chunkId).toBe("meaningful-1");
    expect(ranked[1].chunkId).toBe("noise-1");
  });

  it("keeps deterministic ordering when scores tie", () => {
    const ranked = rankSummaries([
      summary({
        chunkId: "a",
        filePath: "src/tie.ts",
        probableType: "docs",
        importance: 4,
      }),
      summary({
        chunkId: "b",
        filePath: "src/tie.ts",
        probableType: "docs",
        importance: 4,
      }),
    ]);

    expect(ranked.map((entry) => entry.chunkId)).toEqual(["a", "b"]);
  });
});

describe("filterForSynthesis", () => {
  it("keeps only non-noise summaries when meaningful summaries exist", () => {
    const ranked = rankSummaries([
      summary({
        chunkId: "n1",
        filePath: "pnpm-lock.yaml",
        probableType: "chore",
        importance: 9,
        isNoise: true,
      }),
      summary({
        chunkId: "m1",
        filePath: "src/feature.ts",
        probableType: "feat",
        importance: 7,
      }),
      summary({
        chunkId: "m2",
        filePath: "src/bug.ts",
        probableType: "fix",
        importance: 8,
      }),
    ]);

    const filtered = filterForSynthesis(ranked, { limit: 2 });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((entry) => !entry.isNoise)).toBe(true);
  });

  it("falls back to noise summaries when every summary is noise", () => {
    const ranked = rankSummaries([
      summary({ chunkId: "n1", isNoise: true, filePath: "pnpm-lock.yaml", probableType: "chore" }),
      summary({ chunkId: "n2", isNoise: true, filePath: "dist/app.js", probableType: "chore" }),
    ]);

    const fallback = filterForSynthesis(ranked, { limit: 1 });
    const dropped = filterForSynthesis(ranked, { limit: 1, includeNoiseWhenAllNoise: false });

    expect(fallback).toHaveLength(1);
    expect(fallback[0].isNoise).toBe(true);
    expect(dropped).toHaveLength(0);
  });
});

describe("selectTopSummary", () => {
  it("selects top non-noise first and falls back to top-ranked noise", () => {
    const meaningful = rankSummaries([
      summary({ chunkId: "noise-first", isNoise: true, filePath: "dist/app.js", probableType: "chore" }),
      summary({ chunkId: "main", isNoise: false, filePath: "src/core.ts", probableType: "fix", importance: 6 }),
    ]);

    const onlyNoise = rankSummaries([
      summary({ chunkId: "noise-only", isNoise: true, filePath: "dist/app.js", probableType: "chore" }),
    ]);

    expect(selectTopSummary(meaningful)?.chunkId).toBe("main");
    expect(selectTopSummary(onlyNoise)?.chunkId).toBe("noise-only");
  });
});
