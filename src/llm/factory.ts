import type { AppConfig } from "../config/load.js";
import type { LlmProvider } from "./provider.js";
import { MockLlmProvider } from "./mockProvider.js";
import { OpenAiProvider } from "./openaiProvider.js";

export type ProviderKind = "mock" | "openai";

interface ProviderConfigInput extends AppConfig {
  llmProvider?: string;
}

export interface ResolvedProviderConfig {
  provider: ProviderKind;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl: string;
}

export interface CreateProviderOptions {
  fetchImpl?: typeof fetch;
}

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeProviderKind(input: string | undefined): ProviderKind {
  if (!input) {
    return "mock";
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === "mock" || normalized === "openai") {
    return normalized;
  }

  throw new Error(`Unsupported llm provider: ${input}`);
}

export function resolveProviderConfig(input: ProviderConfigInput = {}): ResolvedProviderConfig {
  const providerSetting = firstNonEmpty(input.llmProvider);
  const key = firstNonEmpty(input.openaiApiKey);
  const provider = providerSetting ? normalizeProviderKind(providerSetting) : key ? "openai" : "mock";

  const config: ResolvedProviderConfig = {
    provider,
    openaiApiKey: key,
    openaiModel: firstNonEmpty(input.openaiModel) ?? DEFAULT_OPENAI_MODEL,
    openaiBaseUrl: firstNonEmpty(input.openaiBaseUrl) ?? DEFAULT_OPENAI_BASE_URL,
  };

  if (config.provider === "openai" && !config.openaiApiKey) {
    throw new Error("OpenAI provider requires openaiApiKey (set in config file or OPENAI_API_KEY)");
  }

  return config;
}

export function createProviderFromConfig(
  input: ProviderConfigInput = {},
  options: CreateProviderOptions = {},
): LlmProvider {
  const resolved = resolveProviderConfig(input);

  if (resolved.provider === "mock") {
    return new MockLlmProvider();
  }

  return new OpenAiProvider({
    apiKey: resolved.openaiApiKey ?? "",
    model: resolved.openaiModel,
    baseUrl: resolved.openaiBaseUrl,
    fetchImpl: options.fetchImpl,
  });
}
