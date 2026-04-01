import { describe, expect, it } from "vitest";

import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "../../src/llm/provider.js";
import { createTrackedProvider } from "../../src/pipeline/usage.js";

class StaticProvider implements LlmProvider {
  private readonly summarizeOutput: string;
  private readonly synthesizeOutput: string;
  private readonly generateOutput: string;

  constructor({
    summarizeOutput,
    synthesizeOutput,
    generateOutput,
  }: {
    summarizeOutput: string;
    synthesizeOutput: string;
    generateOutput: string;
  }) {
    this.summarizeOutput = summarizeOutput;
    this.synthesizeOutput = synthesizeOutput;
    this.generateOutput = generateOutput;
  }

  async generate(_request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    return { text: this.generateOutput };
  }

  async summarizeChunk(_prompt: string): Promise<string> {
    return this.summarizeOutput;
  }

  async synthesizeCommit(_prompt: string): Promise<string> {
    return this.synthesizeOutput;
  }
}

describe("createTrackedProvider", () => {
  it("tracks usage for summarize and synthesize calls", async () => {
    const tracked = createTrackedProvider(
      new StaticProvider({
        summarizeOutput: "1234",
        synthesizeOutput: "12345678",
        generateOutput: "unused",
      }),
    );

    await tracked.provider.summarizeChunk("12345678");
    await tracked.provider.synthesizeCommit("1234");

    const usage = tracked.getUsage();
    expect(usage.requestCount).toBe(2);
    expect(usage.promptTokens).toBe(3);
    expect(usage.completionTokens).toBe(3);
    expect(usage.totalTokens).toBe(6);
  });

  it("tracks usage for generic generate calls", async () => {
    const tracked = createTrackedProvider(
      new StaticProvider({
        summarizeOutput: "unused",
        synthesizeOutput: "unused",
        generateOutput: "1234",
      }),
    );

    await tracked.provider.generate({
      task: "summarize_chunk",
      prompt: "12345678",
      responseFormat: "json",
    });

    const usage = tracked.getUsage();
    expect(usage.requestCount).toBe(1);
    expect(usage.promptTokens).toBe(2);
    expect(usage.completionTokens).toBe(1);
    expect(usage.totalTokens).toBe(3);
  });
});
