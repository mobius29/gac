import { describe, expect, it } from "vitest";

import { collectGitDiff, commitWithMessage, type GitCommandRunner } from "../src/git.js";

class Runner implements GitCommandRunner {
  readonly calls: string[] = [];
  private readonly outputs: Record<string, { stdout: string; stderr?: string; status?: number }>;

  constructor(outputs: Record<string, { stdout: string; stderr?: string; status?: number }>) {
    this.outputs = outputs;
  }

  run(args: string[]) {
    const key = args.join(" ");
    this.calls.push(key);
    const result = this.outputs[key];
    return {
      stdout: result?.stdout ?? "",
      stderr: result?.stderr ?? "",
      status: result?.status ?? 0,
    };
  }
}

describe("collectGitDiff", () => {
  it("uses staged diff by default", () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": { stdout: "diff --git a/x b/x\n" },
      "diff --no-ext-diff": { stdout: "" },
    });

    const result = collectGitDiff({ allowUnstagedFallback: true }, runner);
    expect(result.source).toBe("staged");
  });

  it("falls back to unstaged diff when staged is empty", () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": { stdout: "" },
      "diff --no-ext-diff": { stdout: "diff --git a/y b/y\n" },
    });

    const result = collectGitDiff({ allowUnstagedFallback: true }, runner);
    expect(result.source).toBe("unstaged");
  });

  it("retries staged collection with plumbing commands when --cached is rejected", () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": {
        stdout: "",
        stderr: "error: unknown option 'cached'",
        status: 129,
      },
      "rev-parse --verify HEAD": {
        stdout: "abc123\n",
        status: 0,
      },
      "diff-index --cached --patch --no-ext-diff --root HEAD --": {
        stdout: "diff --git a/z b/z\n",
        status: 0,
      },
    });

    const result = collectGitDiff({ allowUnstagedFallback: true }, runner);
    expect(result.source).toBe("staged");
    expect(result.rawDiff).toContain("diff --git");
  });
});

describe("commitWithMessage", () => {
  it("creates a commit directly when source is staged", () => {
    const runner = new Runner({
      "commit -m feat: add parser": { stdout: "", status: 0 },
    });

    commitWithMessage({ message: "feat: add parser", source: "staged" }, runner);

    expect(runner.calls).toEqual(["commit -m feat: add parser"]);
  });

  it("stages tracked changes first when source is unstaged", () => {
    const runner = new Runner({
      "add -u": { stdout: "", status: 0 },
      "commit -m fix: handle fallback": { stdout: "", status: 0 },
    });

    commitWithMessage({ message: "fix: handle fallback", source: "unstaged" }, runner);

    expect(runner.calls).toEqual(["add -u", "commit -m fix: handle fallback"]);
  });

  it("rejects empty commit messages", () => {
    const runner = new Runner({});

    expect(() => commitWithMessage({ message: "   ", source: "staged" }, runner)).toThrowError(
      "Cannot commit with an empty message",
    );
    expect(runner.calls).toEqual([]);
  });

  it("throws a clear error when commit command fails", () => {
    const runner = new Runner({
      "commit -m feat: add parser": {
        stdout: "",
        stderr: "nothing to commit",
        status: 1,
      },
    });

    expect(() => commitWithMessage({ message: "feat: add parser", source: "staged" }, runner)).toThrowError(
      "Failed to create commit: nothing to commit",
    );
  });
});
