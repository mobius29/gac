import { describe, expect, it } from "vitest";

import { createProviderFromConfig, resolveProviderConfig } from "../../src/llm/factory.js";
import { MockLlmProvider } from "../../src/llm/mockProvider.js";
import { OpenAiProvider } from "../../src/llm/openaiProvider.js";

describe("llm factory", () => {
  it("defaults to mock provider when no api key is configured", () => {
    const provider = createProviderFromConfig({});
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it("auto-selects openai provider when api key is configured", () => {
    const provider = createProviderFromConfig({
      openaiApiKey: "test-key",
    });
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it("throws clear error when provider=openai without key", () => {
    expect(() =>
      resolveProviderConfig({
        llmProvider: "openai",
      }),
    ).toThrow("OpenAI provider requires openaiApiKey");
  });

  it("throws clear error for unsupported provider", () => {
    expect(() =>
      resolveProviderConfig({
        llmProvider: "anthropic",
      }),
    ).toThrow("Unsupported llm provider");
  });
});
