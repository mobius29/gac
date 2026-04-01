import { describe, expect, it } from "vitest";

import { detectNoise } from "../src/diff/noise.js";

describe("detectNoise", () => {
  it("identifies generated/build artifacts", () => {
    expect(detectNoise("dist/bundle.js", false).isNoise).toBe(true);
    expect(detectNoise("coverage/lcov.info", false).reason).toBe("coverage");
    expect(detectNoise("src/main.ts", false).isNoise).toBe(false);
  });
});
