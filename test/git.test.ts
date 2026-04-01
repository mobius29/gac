import { describe, expect, it } from "vitest";

import { collectGitDiff, type GitCommandRunner } from "../src/git.js";

class Runner implements GitCommandRunner {
  private readonly outputs: Record<string, { stdout: string; stderr?: string; status?: number }>;

  constructor(outputs: Record<string, { stdout: string; stderr?: string; status?: number }>) {
    this.outputs = outputs;
  }

  run(args: string[]) {
    const key = args.join(" ");
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
