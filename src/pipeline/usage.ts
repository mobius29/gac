import { estimateTokens } from "../diff/utils.js";
import type { LlmProvider } from "../llm/provider.js";

export interface LlmUsageMetrics {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function trackUsage(usage: LlmUsageMetrics, prompt: string, output: string): void {
  usage.requestCount += 1;
  usage.promptTokens += estimateTokens(prompt);
  usage.completionTokens += estimateTokens(output);
  usage.totalTokens = usage.promptTokens + usage.completionTokens;
}

export function createTrackedProvider(provider: LlmProvider): {
  provider: LlmProvider;
  getUsage: () => LlmUsageMetrics;
} {
  const usage: LlmUsageMetrics = {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const trackedProvider: LlmProvider = {
    async generate(request) {
      const response = await provider.generate(request);
      trackUsage(usage, request.prompt, response.text);
      return response;
    },

    async summarizeChunk(prompt) {
      const output = await provider.summarizeChunk(prompt);
      trackUsage(usage, prompt, output);
      return output;
    },

    async synthesizeCommit(prompt) {
      const output = await provider.synthesizeCommit(prompt);
      trackUsage(usage, prompt, output);
      return output;
    },
  };

  return {
    provider: trackedProvider,
    getUsage() {
      return { ...usage };
    },
  };
}
