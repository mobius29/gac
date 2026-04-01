import { describe, expect, it } from "vitest";

import {
  collectDiffMetadata,
  collectGitDiff,
  GitCommandError,
  type GitCommandResult,
  type GitCommandRunner,
} from "../../src/git/collect.js";

class MockGitRunner implements GitCommandRunner {
  readonly calls: string[] = [];
  private readonly outputs: Record<string, GitCommandResult>;

  constructor(outputs: Record<string, GitCommandResult>) {
    this.outputs = outputs;
  }

  run(args: string[]): GitCommandResult {
    const key = args.join(" ");
    this.calls.push(key);
    return this.outputs[key] ?? { stdout: "", stderr: "", status: 0 };
  }
}

const STAGED_ARGS = "diff --cached --no-ext-diff";
const UNSTAGED_ARGS = "diff --no-ext-diff";

const STAGED_DIFF_WITH_BINARY = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
-export const value = 1;
+export const value = 2;
+export const enabled = true;
diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
Binary files /dev/null and b/assets/logo.png differ
`;

describe("collectGitDiff", () => {
  it("uses staged diff by default and returns metadata", () => {
    const runner = new MockGitRunner({
      [STAGED_ARGS]: { stdout: STAGED_DIFF_WITH_BINARY, stderr: "", status: 0 },
    });

    const result = collectGitDiff({}, runner);

    expect(result.source).toBe("staged");
    expect(result.metadata.changedFiles).toEqual(["src/app.ts", "assets/logo.png"]);
    expect(result.metadata.additions).toBe(2);
    expect(result.metadata.deletions).toBe(1);
    expect(result.metadata.binaryFiles).toEqual(["assets/logo.png"]);
    expect(runner.calls).toEqual([STAGED_ARGS]);
  });

  it("falls back to unstaged diff when staged diff is empty", () => {
    const runner = new MockGitRunner({
      [STAGED_ARGS]: { stdout: "", stderr: "", status: 0 },
      [UNSTAGED_ARGS]: {
        stdout: `diff --git "a/src/with space.ts" "b/src/with space.ts"
index aaa..bbb 100644
--- "a/src/with space.ts"
+++ "b/src/with space.ts"
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`,
        stderr: "",
        status: 0,
      },
    });

    const result = collectGitDiff({}, runner);

    expect(result.source).toBe("unstaged");
    expect(result.metadata.changedFiles).toEqual(["src/with space.ts"]);
    expect(runner.calls).toEqual([STAGED_ARGS, UNSTAGED_ARGS]);
  });

  it("does not fallback when allowUnstagedFallback is false", () => {
    const runner = new MockGitRunner({
      [STAGED_ARGS]: { stdout: "", stderr: "", status: 0 },
      [UNSTAGED_ARGS]: { stdout: "unexpected", stderr: "", status: 0 },
    });

    const result = collectGitDiff({ allowUnstagedFallback: false }, runner);

    expect(result.source).toBe("staged");
    expect(result.rawDiff).toBe("");
    expect(result.metadata.files).toEqual([]);
    expect(runner.calls).toEqual([STAGED_ARGS]);
  });

  it("throws GitCommandError when subprocess fails", () => {
    const runner = new MockGitRunner({
      [STAGED_ARGS]: {
        stdout: "",
        stderr: "fatal: not a git repository",
        status: 128,
      },
    });

    expect(() => collectGitDiff({}, runner)).toThrowError(GitCommandError);
  });
});

describe("collectDiffMetadata", () => {
  it("extracts file-level additions/deletions and binary markers", () => {
    const metadata = collectDiffMetadata(STAGED_DIFF_WITH_BINARY);

    expect(metadata.files).toEqual([
      {
        path: "src/app.ts",
        oldPath: "src/app.ts",
        additions: 2,
        deletions: 1,
        isBinary: false,
      },
      {
        path: "assets/logo.png",
        oldPath: undefined,
        additions: 0,
        deletions: 0,
        isBinary: true,
      },
    ]);
  });
});
