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
    expect(stdout.read()).toContain("--no-unstaged-fallback");
    expect(stdout.read()).toContain("--commit");
    expect(stdout.read()).toContain("--debug");
    expect(stderr.read()).toBe("");
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

  it("prints debug metadata when --debug is enabled", async () => {
    const runner = new Runner({
      "diff --cached --no-ext-diff": { stdout: SIMPLE_APP_DIFF },
    });
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    const exitCode = await runCli(["--debug"], {
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

  it("commits with the generated message when --commit is enabled", async () => {
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();
    const commitCalls: Array<{ message: string; source: "staged" | "unstaged" }> = [];

    const exitCode = await runCli(["--commit"], {
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

    const exitCode = await runCli(["--commit"], {
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
});
