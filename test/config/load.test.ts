import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load.js";

describe("config loader", () => {
  it("merges .gac.config files from home to cwd with nearest values taking precedence", () => {
    const root = mkdtempSync(join(tmpdir(), "git-auto-commit-config-"));
    const homeDir = join(root, "home");
    const projectParent = join(homeDir, "workspace");
    const cwd = join(projectParent, "repo");

    mkdirSync(projectParent, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    writeFileSync(
      join(homeDir, ".gac.config"),
      ["LLM_PROVIDER=openai", "OPENAI_API_KEY=home-key", "OPENAI_MODEL=gpt-home"].join("\n"),
      "utf8",
    );

    writeFileSync(
      join(projectParent, ".gac.config"),
      ["OPENAI_API_KEY=workspace-key", "OPENAI_MODEL=gpt-workspace"].join("\n"),
      "utf8",
    );

    writeFileSync(
      join(cwd, ".gac.config"),
      ["OPENAI_API_KEY=repo-key"].join("\n"),
      "utf8",
    );

    const loaded = loadConfig({ cwd, homeDir, env: {} });

    expect(loaded.loadedFiles).toHaveLength(3);
    expect(loaded.config.llmProvider).toBe("openai");
    expect(loaded.config.openaiApiKey).toBe("repo-key");
    expect(loaded.config.openaiModel).toBe("gpt-workspace");

    rmSync(root, { recursive: true, force: true });
  });

  it("supports explicit config path through GAC_CONFIG", () => {
    const root = mkdtempSync(join(tmpdir(), "git-auto-commit-config-explicit-"));
    const configPath = join(root, "custom.gac.config");

    writeFileSync(
      configPath,
      "LLM_PROVIDER=mock",
      "utf8",
    );

    const loaded = loadConfig({
      cwd: root,
      homeDir: root,
      env: {
        GAC_CONFIG: configPath,
      },
    });

    expect(loaded.loadedFiles).toEqual([configPath]);
    expect(loaded.config.llmProvider).toBe("mock");

    rmSync(root, { recursive: true, force: true });
  });

  it("keeps supporting explicit config path through legacy GIT_AUTO_COMMIT_CONFIG", () => {
    const root = mkdtempSync(join(tmpdir(), "git-auto-commit-config-legacy-"));
    const configPath = join(root, "legacy.gac.config");
    writeFileSync(configPath, "OPENAI_MODEL=gpt-legacy", "utf8");

    const loaded = loadConfig({
      cwd: root,
      homeDir: root,
      env: { GIT_AUTO_COMMIT_CONFIG: configPath },
    });

    expect(loaded.loadedFiles).toEqual([configPath]);
    expect(loaded.config.openaiModel).toBe("gpt-legacy");

    rmSync(root, { recursive: true, force: true });
  });

  it("stops discovery at git project root when running from a subdirectory", () => {
    const root = mkdtempSync(join(tmpdir(), "git-auto-commit-config-root-"));
    const homeDir = join(root, "home");
    const projectRoot = join(homeDir, "repo");
    const nestedCwd = join(projectRoot, "packages", "cli");

    mkdirSync(join(projectRoot, ".git"), { recursive: true });
    mkdirSync(nestedCwd, { recursive: true });

    writeFileSync(join(homeDir, ".gac.config"), "OPENAI_MODEL=gpt-home", "utf8");
    writeFileSync(join(projectRoot, ".gac.config"), "OPENAI_MODEL=gpt-project", "utf8");
    writeFileSync(join(nestedCwd, ".gac.config"), "OPENAI_MODEL=gpt-nested", "utf8");

    const loaded = loadConfig({ cwd: nestedCwd, homeDir, env: {} });

    expect(loaded.loadedFiles).toContain(join(homeDir, ".gac.config"));
    expect(loaded.loadedFiles).toContain(join(projectRoot, ".gac.config"));
    expect(loaded.loadedFiles).not.toContain(join(nestedCwd, ".gac.config"));
    expect(loaded.config.openaiModel).toBe("gpt-project");

    rmSync(root, { recursive: true, force: true });
  });
});
