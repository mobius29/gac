import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { createOrUpdatePullRequest, createPullRequest, type GhCommandRunner } from "../src/gh.js";

interface RunnerResult {
  stdout: string;
  stderr?: string;
  status?: number;
}

function isRunnerResult(value: RunnerResult | Record<string, RunnerResult>): value is RunnerResult {
  return typeof (value as RunnerResult).stdout === "string";
}

class MockGhRunner implements GhCommandRunner {
  readonly calls: string[][] = [];
  private readonly singleOutput?: RunnerResult;
  private readonly mappedOutputs?: Record<string, RunnerResult>;

  constructor(
    outputs: RunnerResult | Record<string, RunnerResult>,
  ) {
    if (isRunnerResult(outputs)) {
      this.singleOutput = outputs;
      return;
    }
    this.mappedOutputs = outputs;
  }

  run(args: string[]) {
    this.calls.push(args);
    const key = args.join(" ");
    const result =
      this.singleOutput ??
      this.mappedOutputs?.[key] ??
      ({ stdout: "", stderr: `unexpected gh call: ${key}`, status: 1 } as RunnerResult);
    return {
      stdout: result.stdout,
      stderr: result.stderr ?? "",
      status: result.status ?? 0,
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

  it("uses fallback body when template file does not exist", () => {
    const cwd = createTempDirectory();
    const runner = new MockGhRunner({ stdout: "https://example.test/pull/11\n" });

    createPullRequest(
      {
        title: "feat: add cache hydration",
        fallbackBody: "## Summary\n- Add cache hydration worker\n",
        cwd,
      },
      runner,
    );

    expect(runner.calls).toEqual([
      [
        "pr",
        "create",
        "--title",
        "feat: add cache hydration",
        "--body",
        "## Summary\n- Add cache hydration worker\n",
      ],
    ]);
  });

  it("prefers template body over fallback body when template file exists", () => {
    const cwd = createTempDirectory();
    mkdirSync(join(cwd, ".github"), { recursive: true });
    writeFileSync(join(cwd, ".github", "pull_request_template.md"), "## Template body\n", "utf8");
    const runner = new MockGhRunner({ stdout: "https://example.test/pull/12\n" });

    createPullRequest(
      {
        title: "feat: integrate queue",
        fallbackBody: "## Summary\n- Generated body that should be ignored\n",
        cwd,
      },
      runner,
    );

    expect(runner.calls).toEqual([
      ["pr", "create", "--title", "feat: integrate queue", "--body", "## Template body\n"],
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

describe("createOrUpdatePullRequest", () => {
  it("updates existing pull request when branch pair already has an open PR", () => {
    const runner = new MockGhRunner({
      "pr list --state open --base develop --head feature/new-api --json number,headRefOid,url": {
        stdout: '[{"number":42,"headRefOid":"abc123","url":"https://example.test/pull/42"}]\n',
      },
      "pr edit 42 --title feat: add batch import --body Add endpoint summary": {
        stdout: "https://example.test/pull/42\n",
      },
    });

    const result = createOrUpdatePullRequest(
      {
        title: "feat: add batch import",
        body: "Add endpoint summary",
        base: "develop",
        head: "feature/new-api",
      },
      runner,
    );

    expect(result.action).toBe("updated");
    expect(result.number).toBe(42);
    expect(result.output).toBe("https://example.test/pull/42");
    expect(runner.calls).toEqual([
      ["pr", "list", "--state", "open", "--base", "develop", "--head", "feature/new-api", "--json", "number,headRefOid,url"],
      ["pr", "edit", "42", "--title", "feat: add batch import", "--body", "Add endpoint summary"],
    ]);
  });

  it("creates pull request when no open PR exists for branch pair", () => {
    const runner = new MockGhRunner({
      "pr list --state open --base main --head feature/seed-data --json number,headRefOid,url": {
        stdout: "[]\n",
      },
      "pr create --title feat: seed data --body Seed records --base main --head feature/seed-data": {
        stdout: "https://example.test/pull/77\n",
      },
    });

    const result = createOrUpdatePullRequest(
      {
        title: "feat: seed data",
        body: "Seed records",
        base: "main",
        head: "feature/seed-data",
      },
      runner,
    );

    expect(result.action).toBe("created");
    expect(result.output).toBe("https://example.test/pull/77");
    expect(runner.calls).toEqual([
      ["pr", "list", "--state", "open", "--base", "main", "--head", "feature/seed-data", "--json", "number,headRefOid,url"],
      [
        "pr",
        "create",
        "--title",
        "feat: seed data",
        "--body",
        "Seed records",
        "--base",
        "main",
        "--head",
        "feature/seed-data",
      ],
    ]);
  });
});
