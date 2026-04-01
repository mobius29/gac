import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { createPullRequest, type GhCommandRunner } from "../src/gh.js";

class MockGhRunner implements GhCommandRunner {
  readonly calls: string[][] = [];
  private readonly result: { stdout: string; stderr?: string; status?: number };

  constructor(result: { stdout: string; stderr?: string; status?: number }) {
    this.result = result;
  }

  run(args: string[]) {
    this.calls.push(args);
    return {
      stdout: this.result.stdout,
      stderr: this.result.stderr ?? "",
      status: this.result.status ?? 0,
    };
  }
}

const temporaryDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "gac-gh-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("createPullRequest", () => {
  it("creates a pull request with generated title when no template exists", () => {
    const cwd = createTempDirectory();
    const runner = new MockGhRunner({
      stdout: "https://github.com/acme/app/pull/22\n",
    });

    const result = createPullRequest(
      {
        title: "feat: add parser",
        cwd,
      },
      runner,
    );

    expect(result.output).toBe("https://github.com/acme/app/pull/22");
    expect(runner.calls).toEqual([["pr", "create", "--title", "feat: add parser", "--body", ""]]);
  });

  it("uses pull request template body when template file exists", () => {
    const cwd = createTempDirectory();
    mkdirSync(join(cwd, ".github"), { recursive: true });
    writeFileSync(
      join(cwd, ".github", "pull_request_template.md"),
      "## Summary\n\n{{TITLE}}\n\n## Testing\n- [ ] done\n",
      "utf8",
    );
    const runner = new MockGhRunner({ stdout: "https://example.test/pull/1\n" });

    createPullRequest(
      {
        title: "fix: guard null values",
        cwd,
      },
      runner,
    );

    expect(runner.calls).toEqual([
      [
        "pr",
        "create",
        "--title",
        "fix: guard null values",
        "--body",
        "## Summary\n\nfix: guard null values\n\n## Testing\n- [ ] done\n",
      ],
    ]);
  });

  it("uses template Title directive when present", () => {
    const cwd = createTempDirectory();
    mkdirSync(join(cwd, "docs"), { recursive: true });
    writeFileSync(
      join(cwd, "docs", "PULL_REQUEST_TEMPLATE.md"),
      "Title: release {{COMMIT_SUBJECT}}\n\n## Why\n- stabilize patch\n",
      "utf8",
    );
    const runner = new MockGhRunner({ stdout: "https://example.test/pull/2\n" });

    createPullRequest(
      {
        title: "chore: prepare release",
        cwd,
      },
      runner,
    );

    expect(runner.calls).toEqual([
      [
        "pr",
        "create",
        "--title",
        "release chore: prepare release",
        "--body",
        "\n## Why\n- stabilize patch\n",
      ],
    ]);
  });

  it("prefers explicit body over detected template content", () => {
    const cwd = createTempDirectory();
    mkdirSync(join(cwd, ".github"), { recursive: true });
    writeFileSync(join(cwd, ".github", "pull_request_template.md"), "ignored template", "utf8");
    const runner = new MockGhRunner({ stdout: "https://example.test/pull/3\n" });

    createPullRequest(
      {
        title: "docs: update commands",
        body: "Custom PR body",
        cwd,
      },
      runner,
    );

    expect(runner.calls).toEqual([
      ["pr", "create", "--title", "docs: update commands", "--body", "Custom PR body"],
    ]);
  });

  it("throws a clear error when gh pr create fails", () => {
    const cwd = createTempDirectory();
    const runner = new MockGhRunner({
      stdout: "",
      stderr: "no commits between base and head",
      status: 1,
    });

    expect(() =>
      createPullRequest(
        {
          title: "feat: add import endpoint",
          cwd,
        },
        runner,
      ),
    ).toThrowError("Failed to create pull request: no commits between base and head");
  });

  it("rejects an empty pull request title", () => {
    const cwd = createTempDirectory();
    const runner = new MockGhRunner({ stdout: "ignored" });

    expect(() =>
      createPullRequest(
        {
          title: "  ",
          cwd,
        },
        runner,
      ),
    ).toThrowError("Cannot create pull request with an empty title");
    expect(runner.calls).toEqual([]);
  });
});
