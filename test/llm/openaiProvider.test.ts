import { describe, expect, it } from "vitest";

import { OpenAiProvider } from "../../src/llm/openaiProvider.js";

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAiProvider", () => {
  it("sends chat completions request and returns assistant text", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    const provider = new OpenAiProvider({
      apiKey: "test-key",
      model: "gpt-test",
      baseUrl: "https://example.test/v1",
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return createJsonResponse({
          choices: [{ message: { content: "feat: add config loading" } }],
        });
      }) as typeof fetch,
    });

    const result = await provider.generate({
      task: "synthesize_commit",
      prompt: "PROMPT",
      responseFormat: "text",
    });

    expect(result.text).toBe("feat: add config loading");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://example.test/v1/chat/completions");

    const payload = JSON.parse(String(calls[0]?.init?.body));
    expect(payload.model).toBe("gpt-test");
    expect(payload.messages[1].content).toBe("PROMPT");
  });

  it("throws clear error when API returns non-2xx", async () => {
    const provider = new OpenAiProvider({
      apiKey: "bad-key",
      fetchImpl: (async () =>
        createJsonResponse(
          {
            error: {
              message: "invalid key",
            },
          },
          401,
        )) as typeof fetch,
    });

    await expect(
      provider.generate({
        task: "summarize_chunk",
        prompt: "PROMPT",
        responseFormat: "json",
      }),
    ).rejects.toThrow("OpenAI request failed: invalid key");
  });
});
