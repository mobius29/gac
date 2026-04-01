import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "./provider.js";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

type FetchFunction = typeof fetch;

export interface OpenAiProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchFunction;
}

interface OpenAiErrorPayload {
  error?: {
    message?: string;
  };
}

interface OpenAiSuccessPayload {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function buildSystemPrompt(request: LlmGenerateRequest): string {
  if (request.task === "summarize_chunk") {
    return [
      "You summarize git diff chunks for commit-message generation.",
      "Return only one JSON object that matches the requested fields.",
      "Do not include markdown fences.",
    ].join(" ");
  }

  return [
    "You synthesize one Conventional Commit subject line from ranked summaries.",
    "Return only one line in the format type: subject.",
    "No markdown, no explanation.",
  ].join(" ");
}

async function readErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as OpenAiErrorPayload;
      const message = payload.error?.message?.trim();
      if (message) {
        return message;
      }
    } catch {
      // Fall through to text body extraction.
    }
  }

  const text = (await response.text()).trim();
  return text || `HTTP ${response.status}`;
}

export class OpenAiProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchFunction;

  constructor(options: OpenAiProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("OpenAI API key is required");
    }

    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || DEFAULT_OPENAI_MODEL;
    this.baseUrl = options.baseUrl?.replace(/\/+$/, "") || DEFAULT_OPENAI_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: buildSystemPrompt(request) },
            { role: "user", content: request.prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const reason = await readErrorBody(response);
        throw new Error(`OpenAI request failed: ${reason}`);
      }

      const payload = (await response.json()) as OpenAiSuccessPayload;
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("OpenAI response did not include message content");
      }

      return { text: content };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenAI request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async summarizeChunk(prompt: string): Promise<string> {
    return (await this.generate({ task: "summarize_chunk", prompt, responseFormat: "json" })).text;
  }

  async synthesizeCommit(prompt: string): Promise<string> {
    return (await this.generate({ task: "synthesize_commit", prompt, responseFormat: "text" })).text;
  }
}
