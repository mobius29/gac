import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadEnvironmentFile, parseDotEnv } from "../../src/utils/env.js";

describe("env utils", () => {
  it("parses dotenv syntax including export and quoted values", () => {
    const parsed = parseDotEnv(`
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

  it("loads .env values without overriding pre-existing env vars", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "git-auto-commit-env-"));
    const envPath = join(tempDir, ".env");

    writeFileSync(
      envPath,
      ["OPENAI_API_KEY=from_file", "OPENAI_MODEL=gpt-test", "CUSTOM=value_from_file"].join("\n"),
      "utf8",
    );

    const env: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: "from_process",
    };

    const result = loadEnvironmentFile(envPath, env);

    expect(result.loadedKeys).toContain("OPENAI_MODEL");
    expect(result.loadedKeys).toContain("CUSTOM");
    expect(result.loadedKeys).not.toContain("OPENAI_API_KEY");
    expect(env.OPENAI_API_KEY).toBe("from_process");
    expect(env.OPENAI_MODEL).toBe("gpt-test");
    expect(env.CUSTOM).toBe("value_from_file");

    rmSync(tempDir, { recursive: true, force: true });
  });
});
