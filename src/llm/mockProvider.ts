import type { ChangeType } from "../types.js";
import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider } from "./provider.js";

const changeTypes: readonly ChangeType[] = ["feat", "fix", "refactor", "docs", "test", "chore"];

function extractField(prompt: string, key: string): string | undefined {
  const match = prompt.match(new RegExp(`^${key}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  return raw.toLowerCase() === "true";
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

function clampImportance(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function inferTypeFromPath(path: string): ChangeType {
  if (/(^|\/)test(s)?\//i.test(path) || /\.test\./i.test(path)) return "test";
  if (/\.md$/i.test(path) || /(^|\/)docs\//i.test(path)) return "docs";
  if (/fix|bug|error|hotfix/i.test(path)) return "fix";
  if (/refactor|cleanup/i.test(path)) return "refactor";
  return "feat";
}

function inferReason(type: ChangeType, isNoise: boolean): string {
  if (isNoise) {
    return "Generated files or maintenance artifacts changed";
  }
  if (type === "fix") {
    return "The changes likely address incorrect behavior";
  }
  if (type === "docs") {
    return "The changes primarily update documentation";
  }
  if (type === "test") {
    return "The changes primarily add or adjust test coverage";
  }
  if (type === "refactor") {
    return "The changes appear to improve structure without changing behavior";
  }
  return "The changes likely add or update application behavior";
}

function firstLine(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed.split("\n")[0]?.trim() ?? "";
}

function sanitizeSubject(subject: string): string {
  return subject
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeChangeType(input: string | undefined, fallback: ChangeType): ChangeType {
  if (!input) return fallback;
  const normalized = input.toLowerCase() as ChangeType;
  return changeTypes.includes(normalized) ? normalized : fallback;
}

function createSummaryFromPrompt(prompt: string): string {
  const filePath = extractField(prompt, "FILE_PATH") ?? "unknown";
  const additions = parseNumber(extractField(prompt, "ADDITIONS"), 0);
  const deletions = parseNumber(extractField(prompt, "DELETIONS"), 0);
  const isNoise = parseBoolean(extractField(prompt, "NOISE"), false);
  const probableType = isNoise ? "chore" : inferTypeFromPath(filePath);
  const totalLines = additions + deletions;
  const baseImportance = isNoise ? 1 : 3 + totalLines / 12;
  const importance = clampImportance(baseImportance);
  const changeSummary = isNoise
    ? `Update ${filePath} generated artifacts`
    : `Update ${filePath} (${additions} additions, ${deletions} deletions)`;

  return JSON.stringify({
    whatChanged: changeSummary,
    whyLikely: inferReason(probableType, isNoise),
    probableType,
    importance,
    isNoise,
  });
}

function createSynthesisFromPrompt(prompt: string): string {
  const topType = safeChangeType(extractField(prompt, "TOP_TYPE"), "chore");
  const topSubject = sanitizeSubject(extractField(prompt, "TOP_SUBJECT") ?? firstLine(extractField(prompt, "RANKED_SUMMARIES") ?? ""));
  const subject = topSubject || "update project files";
  return `${topType}: ${subject}`;
}

export class MockLlmProvider implements LlmProvider {
  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    if (request.task === "summarize_chunk") {
      return { text: createSummaryFromPrompt(request.prompt) };
    }

    return { text: createSynthesisFromPrompt(request.prompt) };
  }

  async summarizeChunk(prompt: string): Promise<string> {
    return (await this.generate({ task: "summarize_chunk", prompt, responseFormat: "json" })).text;
  }

  async synthesizeCommit(prompt: string): Promise<string> {
    return (await this.generate({ task: "synthesize_commit", prompt, responseFormat: "text" })).text;
  }
}
