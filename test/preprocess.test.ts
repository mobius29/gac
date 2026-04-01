import { describe, expect, it } from "vitest";

import { preprocessDiff } from "../src/diff/preprocess.js";
import { LOCKFILE_DIFF, SIMPLE_APP_DIFF } from "./fixtures.js";

describe("preprocessDiff", () => {
  it("parses file hunks and line stats", () => {
    const files = preprocessDiff(SIMPLE_APP_DIFF);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/app.ts");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].additions).toBe(3);
    expect(files[0].deletions).toBe(1);
    expect(files[0].noise.isNoise).toBe(false);
  });

  it("marks lockfile changes as noise", () => {
    const files = preprocessDiff(LOCKFILE_DIFF);

    expect(files[0].noise.isNoise).toBe(true);
    expect(files[0].noise.reason).toBe("lockfile");
  });
});
