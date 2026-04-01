export type LlmTask = "summarize_chunk" | "synthesize_commit";

export type LlmResponseFormat = "text" | "json";

export interface LlmGenerateRequest {
  task: LlmTask;
  prompt: string;
  responseFormat: LlmResponseFormat;
}

export interface LlmGenerateResponse {
  text: string;
}

export interface LlmTextProvider {
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
}

export interface LlmProvider extends LlmTextProvider {
  summarizeChunk(prompt: string): Promise<string>;
  synthesizeCommit(prompt: string): Promise<string>;
}
