import { describe, expect, it } from "vitest";

import { splitByHunk } from "../../src/diff/splitByHunk.js";
import type { FileDiffChunk } from "../../src/diff/splitByFile.js";

function createFileChunk(overrides: Partial<FileDiffChunk> = {}): FileDiffChunk {
  return {
    id: "src/example.ts:file-1",
    filePath: "src/example.ts",
    text: "",
    fileIndex: 0,
    partIndex: 0,
    source: "file",
    isBinary: false,
    ...overrides,
  };
}

describe("splitByHunk", () => {
  it("returns the original chunk when no hunk header exists", () => {
    const chunk = createFileChunk({
      text: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "Binary files differ",
      ].join("\n"),
    });

    const output = splitByHunk(chunk, { maxChunkChars: 50 });

    expect(output).toHaveLength(1);
    expect(output[0].id).toBe(chunk.id);
    expect(output[0].source).toBe("file");
  });

  it("splits a file chunk across hunk boundaries", () => {
    const chunk = createFileChunk({
      text: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1,2 +1,2 @@",
        "-const a = 1;",
        "+const a = 2;",
        "@@ -20,2 +20,2 @@",
        "-const b = 1;",
        "+const b = 2;",
      ].join("\n"),
    });

    const output = splitByHunk(chunk, { maxChunkChars: 200 });

    expect(output).toHaveLength(2);
    expect(output[0].source).toBe("hunk");
    expect(output[0].hunkHeader).toBe("@@ -1,2 +1,2 @@");
    expect(output[1].hunkHeader).toBe("@@ -20,2 +20,2 @@");
    expect(output[0].text).toContain("diff --git a/src/example.ts b/src/example.ts");
  });

  it("splits very large single hunks by size while preserving hunk context", () => {
    const repeated = Array.from({ length: 30 }, (_, index) => `+line_${index}_value`);
    const chunk = createFileChunk({
      text: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1,2 +1,32 @@",
        ...repeated,
      ].join("\n"),
    });

    const output = splitByHunk(chunk, { maxChunkChars: 120 });

    expect(output.length).toBeGreaterThan(1);
    expect(output.every((entry) => entry.hunkHeader === "@@ -1,2 +1,32 @@")).toBe(true);
    expect(output.every((entry) => entry.text.includes("@@ -1,2 +1,32 @@"))).toBe(true);
  });

  it("returns binary chunks unchanged", () => {
    const chunk = createFileChunk({
      isBinary: true,
      text: "diff --git a/assets/a.png b/assets/a.png\nGIT binary patch",
    });

    const output = splitByHunk(chunk, { maxChunkChars: 10 });

    expect(output).toHaveLength(1);
    expect(output[0].id).toBe(chunk.id);
  });
});
