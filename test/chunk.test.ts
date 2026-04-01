import { describe, expect, it } from "vitest";

import { splitIntoChunks } from "../src/diff/chunk.js";
import { preprocessDiff } from "../src/diff/preprocess.js";
import { LARGE_HUNK_DIFF, SIMPLE_APP_DIFF } from "./fixtures.js";

describe("splitIntoChunks", () => {
  it("keeps small file diffs in a single chunk", () => {
    const files = preprocessDiff(SIMPLE_APP_DIFF);
    const chunks = splitIntoChunks(files, { maxChunkTokens: 400, maxChunkChars: 2000 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toContain(":file");
  });

  it("splits oversized hunks by size", () => {
    const files = preprocessDiff(LARGE_HUNK_DIFF);
    const chunks = splitIntoChunks(files, { maxChunkTokens: 20, maxChunkChars: 120 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.filePath === "src/large.ts")).toBe(true);
  });
});
