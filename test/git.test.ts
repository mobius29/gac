import { describe, expect, it } from "vitest";

import {
  collectBranchDiff,
  collectGitDiff,
  commitWithMessage,
  ensureCurrentBranchOnOrigin,
  getCurrentBranchName,
  hasRemoteBranch,
  pushBranchToOrigin,
  type GitCommandRunner,
} from "../src/git.js";

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

describe("pull request git helpers", () => {
  it("reads current branch name", () => {
    const runner = new Runner({
      "rev-parse --abbrev-ref HEAD": { stdout: "feature/pr-draft\n", status: 0 },
    });

    const branch = getCurrentBranchName(runner);
    expect(branch).toBe("feature/pr-draft");
  });

  it("checks whether branch exists on origin", () => {
    const runner = new Runner({
      "ls-remote --exit-code --heads origin feature/pr-draft": {
        stdout: "abc123\trefs/heads/feature/pr-draft\n",
        status: 0,
      },
      "ls-remote --exit-code --heads origin missing-branch": {
        stdout: "",
        status: 2,
      },
    });

    expect(hasRemoteBranch("feature/pr-draft", runner)).toBe(true);
    expect(hasRemoteBranch("missing-branch", runner)).toBe(false);
  });

  it("pushes current branch to origin when missing remotely", () => {
    const runner = new Runner({
      "rev-parse --abbrev-ref HEAD": { stdout: "feature/new-pr\n", status: 0 },
      "rev-parse HEAD": { stdout: "abc123\n", status: 0 },
      "ls-remote --exit-code --heads origin feature/new-pr": { stdout: "", status: 2 },
      "push -u origin feature/new-pr": { stdout: "", status: 0 },
    });

    const branch = ensureCurrentBranchOnOrigin(runner);
    expect(branch).toBe("feature/new-pr");
    expect(runner.calls).toEqual([
      "rev-parse --abbrev-ref HEAD",
      "rev-parse HEAD",
      "ls-remote --exit-code --heads origin feature/new-pr",
      "push -u origin feature/new-pr",
    ]);
  });

  it("does not push when current branch SHA matches origin branch SHA", () => {
    const runner = new Runner({
      "rev-parse --abbrev-ref HEAD": { stdout: "feature/already-there\n", status: 0 },
      "rev-parse HEAD": { stdout: "abc123\n", status: 0 },
      "ls-remote --exit-code --heads origin feature/already-there": {
        stdout: "abc123\trefs/heads/feature/already-there\n",
        status: 0,
      },
    });

    const branch = ensureCurrentBranchOnOrigin(runner);
    expect(branch).toBe("feature/already-there");
    expect(runner.calls).toEqual([
      "rev-parse --abbrev-ref HEAD",
      "rev-parse HEAD",
      "ls-remote --exit-code --heads origin feature/already-there",
    ]);
  });

  it("pushes when current branch SHA differs from origin branch SHA", () => {
    const runner = new Runner({
      "rev-parse --abbrev-ref HEAD": { stdout: "feature/ahead\n", status: 0 },
      "rev-parse HEAD": { stdout: "local123\n", status: 0 },
      "ls-remote --exit-code --heads origin feature/ahead": {
        stdout: "remote456\trefs/heads/feature/ahead\n",
        status: 0,
      },
      "push -u origin feature/ahead": { stdout: "", status: 0 },
    });

    const branch = ensureCurrentBranchOnOrigin(runner);
    expect(branch).toBe("feature/ahead");
    expect(runner.calls).toEqual([
      "rev-parse --abbrev-ref HEAD",
      "rev-parse HEAD",
      "ls-remote --exit-code --heads origin feature/ahead",
      "push -u origin feature/ahead",
    ]);
  });

  it("collects diff against target branch with merge-base semantics", () => {
    const runner = new Runner({
      "diff --no-ext-diff develop...HEAD": { stdout: "diff --git a/x b/x\n", status: 0 },
    });

    const rawDiff = collectBranchDiff("develop", runner);
    expect(rawDiff).toContain("diff --git");
  });

  it("throws clear push errors", () => {
    const runner = new Runner({
      "push -u origin feature/fail": {
        stdout: "",
        stderr: "fatal: 'origin' does not appear to be a git repository",
        status: 1,
      },
    });

    expect(() => pushBranchToOrigin("feature/fail", runner)).toThrowError(
      "Failed to push branch feature/fail to origin: fatal: 'origin' does not appear to be a git repository",
    );
  });
});
