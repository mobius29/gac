import { describe, expect, it } from "vitest";

import { type GitCommandRunner } from "../../src/git.js";
import { MockLlmProvider } from "../../src/llm/mockProvider.js";
import { runCommitMessagePipeline } from "../../src/pipeline/run.js";
import { runCli } from "../../src/cli.js";
import { SIMPLE_APP_DIFF } from "../fixtures.js";

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

interface BufferWriter {
  write: (chunk: string | Uint8Array) => boolean;
  read: () => string;
}

function createBufferWriter(): BufferWriter {
  let output = "";
  return {
    write(chunk: string | Uint8Array): boolean {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    },
    read(): string {
      return output;
    },
  };
}

describe("runCli integration", () => {
  it("prints help output and exits without running pipeline", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["--help"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called when showing help");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("Usage: gac [options]");
    expect(stdout.read()).toContain("no-unstaged-fallback");
    expect(stdout.read()).toContain("commit");
    expect(stdout.read()).toContain("pr <target-branch>");
    expect(stdout.read()).toContain("completion <shell>");
    expect(stdout.read()).toContain("debug");
    expect(stderr.read()).toBe("");
  });

  it("prints zsh completion script and exits without running pipeline", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["completion", "zsh"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called for completion output");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    const script = stdout.read();
    expect(script).toContain("compdef _gac gac");
    expect(script).toContain("refs/remotes/origin");
    expect(script).toContain("pr");
    expect(stderr.read()).toBe("");
  });

  it("returns exit code 1 for unsupported completion shell", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["completion", "fish"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called for invalid completion shell");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain(
      "Failed to generate commit message: Unsupported shell for completion: fish. Supported shells: bash, zsh",
    );
  });

  it("supports -h as a shorthand for --help", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["-h"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called when showing help");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("Usage: gac [options]");
    expect(stderr.read()).toBe("");
  });

  it("prints one Conventional Commit subject line with the default pipeline flow", async () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": { stdout: SIMPLE_APP_DIFF },
    });
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli([], {
      runPipeline: (options) =>
        runCommitMessagePipeline({
          ...options,
          gitRunner: runner,
          provider: new MockLlmProvider(),
        }),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(stdout.read().trim()).toMatch(/^(feat|fix|refactor|docs|test|chore):\s+/);
    expect(stderr.read()).toContain("LLM usage: requests=");
  });

  it("returns exit code 1 when no staged or unstaged changes exist", async () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": { stdout: "" },
      "diff --no-ext-diff": { stdout: "" },
    });
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli([], {
      runPipeline: (options) =>
        runCommitMessagePipeline({
          ...options,
          gitRunner: runner,
          provider: new MockLlmProvider(),
        }),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain("No changes detected in staged diff (or unstaged fallback).");
  });

  it("prints debug metadata when debug is enabled", async () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": { stdout: SIMPLE_APP_DIFF },
    });
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["debug"], {
      runPipeline: (options) =>
        runCommitMessagePipeline({
          ...options,
          gitRunner: runner,
          provider: new MockLlmProvider(),
        }),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toContain("[debug] source=staged summaries=");
    expect(stderr.read()).toContain("LLM usage: requests=");
    expect(stdout.read().trim()).toMatch(/^(feat|fix|refactor|docs|test|chore):\s+/);
  });

  it("commits with the generated message when commit is enabled", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();
    const commitCalls: Array<{ message: string; source: "staged" | "unstaged" }> = [];

    const exitCode = await runCli(["commit"], {
      runPipeline: async () => ({
        diffSource: "staged",
        rawDiff: SIMPLE_APP_DIFF,
        hasChanges: true,
        commitMessage: "feat: add api endpoint",
        sourceSummaries: [],
        llmUsage: {
          requestCount: 4,
          promptTokens: 500,
          completionTokens: 120,
          totalTokens: 620,
        },
      }),
      commitChanges: (options) => {
        commitCalls.push(options);
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(commitCalls).toEqual([{ message: "feat: add api endpoint", source: "staged" }]);
    expect(stdout.read().trim()).toBe("feat: add api endpoint");
    expect(stderr.read()).toContain(
      "LLM usage: requests=4 tokens=620 (prompt=500, completion=120)",
    );
  });

  it("returns exit code 1 when commit step fails", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["commit"], {
      runPipeline: async () => ({
        diffSource: "unstaged",
        rawDiff: SIMPLE_APP_DIFF,
        hasChanges: true,
        commitMessage: "fix: handle null checks",
        sourceSummaries: [],
        llmUsage: {
          requestCount: 3,
          promptTokens: 200,
          completionTokens: 70,
          totalTokens: 270,
        },
      }),
      commitChanges: () => {
        throw new Error("nothing to commit");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain(
      "LLM usage: requests=3 tokens=270 (prompt=200, completion=70)",
    );
    expect(stderr.read()).toContain("Failed to commit changes: nothing to commit");
  });

  it("creates pull request title/body from branch diff when pr is enabled", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();
    const prCalls: Array<{ title: string; base: string; head: string; body: string }> = [];

    const exitCode = await runCli(["pr", "main"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called for pr without commit");
      },
      ensureCurrentBranchOnOrigin: () => "feature/new-api",
      collectBranchDiff: (baseBranch) => {
        expect(baseBranch).toBe("main");
        return SIMPLE_APP_DIFF;
      },
      generateFromRawDiff: async () => ({
        commitMessage: "feat: add batch import command",
        sourceSummaries: [
          {
            chunkId: "a",
            filePath: "src/app.ts",
            whatChanged: "Add batch import endpoint and handler",
            whyLikely: "Support bulk data imports",
            probableType: "feat",
            importance: 9,
            isNoise: false,
          },
        ],
        llmUsage: {
          requestCount: 2,
          promptTokens: 420,
          completionTokens: 90,
          totalTokens: 510,
        },
      }),
      createPullRequest: (options) => {
        prCalls.push(options);
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(prCalls).toEqual([
      {
        title: "feat: add batch import command",
        base: "main",
        head: "feature/new-api",
        body: "## Summary\n- Add batch import endpoint and handler\n\n## Why\n- Support bulk data imports\n",
      },
    ]);
    expect(stdout.read().trim()).toBe("feat: add batch import command");
    expect(stderr.read()).toContain(
      "LLM usage: requests=2 tokens=510 (prompt=420, completion=90)",
    );
  });

  it("runs commit step before pull request when commit and pr are both enabled", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();
    const callOrder: string[] = [];

    const exitCode = await runCli(["commit", "pr", "release/v1"], {
      runPipeline: async () => ({
        diffSource: "unstaged",
        rawDiff: SIMPLE_APP_DIFF,
        hasChanges: true,
        commitMessage: "fix: prevent duplicate saves",
        sourceSummaries: [],
        llmUsage: {
          requestCount: 4,
          promptTokens: 390,
          completionTokens: 110,
          totalTokens: 500,
        },
      }),
      commitChanges: () => {
        callOrder.push("commit");
      },
      ensureCurrentBranchOnOrigin: () => {
        callOrder.push("ensure-origin");
        return "feature/pr-ready";
      },
      collectBranchDiff: () => {
        callOrder.push("branch-diff");
        return SIMPLE_APP_DIFF;
      },
      generateFromRawDiff: async () => {
        callOrder.push("pr-generate");
        return {
          commitMessage: "feat: prepare release candidate",
          sourceSummaries: [],
          llmUsage: {
            requestCount: 2,
            promptTokens: 120,
            completionTokens: 30,
            totalTokens: 150,
          },
        };
      },
      createPullRequest: () => {
        callOrder.push("pr");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(callOrder).toEqual(["commit", "ensure-origin", "branch-diff", "pr-generate", "pr"]);
    expect(stdout.read().trim()).toBe("feat: prepare release candidate");
    expect(stderr.read()).toContain(
      "LLM usage: requests=6 tokens=650 (prompt=510, completion=140)",
    );
  });

  it("returns exit code 1 when pull request step fails", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["pr", "main"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called for pr without commit");
      },
      ensureCurrentBranchOnOrigin: () => "feature/docs",
      collectBranchDiff: () => SIMPLE_APP_DIFF,
      generateFromRawDiff: async () => ({
        commitMessage: "docs: improve usage examples",
        sourceSummaries: [],
        llmUsage: {
          requestCount: 2,
          promptTokens: 150,
          completionTokens: 40,
          totalTokens: 190,
        },
      }),
      createPullRequest: () => {
        throw new Error("no commits between base and head");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain(
      "Failed to create pull request: no commits between base and head",
    );
  });

  it("returns exit code 1 when pr target branch argument is missing", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["pr"], {
      runPipeline: async () => {
        throw new Error("runPipeline should not be called when pr is missing target branch");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain(
      "Failed to generate commit message: pr requires a target branch argument",
    );
  });
});
