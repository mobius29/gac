import { describe, expect, it } from "vitest";

import { parseEnvAssignments } from "../../src/utils/env.js";

describe("env utils", () => {
  it("parses assignment syntax including export and quoted values", () => {
    const parsed = parseEnvAssignments(`
# comment
PLAIN=value
export WITH_EXPORT=enabled
QUOTED="hello world"
SINGLE='x y z'
MULTILINE="line1\\nline2"
INVALID-KEY=ignored
`);

    expect(parsed.PLAIN).toBe("value");
    expect(parsed.WITH_EXPORT).toBe("enabled");
    expect(parsed.QUOTED).toBe("hello world");
    expect(parsed.SINGLE).toBe("x y z");
    expect(parsed.MULTILINE).toBe("line1\nline2");
    expect(parsed["INVALID-KEY"]).toBeUndefined();
  });
});
