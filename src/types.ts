export type ChangeType = "feat" | "fix" | "refactor" | "docs" | "test" | "chore";

export type DiffSource = "staged" | "unstaged";

export interface CollectedDiff {
  source: DiffSource;
  rawDiff: string;
}

export interface GitDiffCollectionOptions {
  allowUnstagedFallback: boolean;
}

export interface Hunk {
  header: string;
  lines: string[];
}

export interface ParsedFileDiff {
  path: string;
  oldPath?: string;
  isBinary: boolean;
  hunks: Hunk[];
  additions: number;
  deletions: number;
  patchText: string;
}

export type NoiseReason =
  | "lockfile"
  | "generated"
  | "build_artifact"
  | "coverage"
  | "minified"
  | "sourcemap"
  | "binary"
  | "unknown";

export interface NoiseAssessment {
  isNoise: boolean;
  reason?: NoiseReason;
  confidence: number;
}

export interface PreprocessedFileDiff extends ParsedFileDiff {
  noise: NoiseAssessment;
}

export interface DiffChunk {
  id: string;
  filePath: string;
  hunkHeader?: string;
  text: string;
  tokenEstimate: number;
  noise: NoiseAssessment;
  additions: number;
  deletions: number;
}

export interface ChunkSummary {
  chunkId: string;
  filePath: string;
  whatChanged: string;
  whyLikely: string;
  probableType: ChangeType;
  importance: number;
  isNoise: boolean;
}

export interface RankedSummary extends ChunkSummary {
  rankScore: number;
}

export interface PipelineInput {
  rawDiff: string;
}

export interface PipelineResult {
  commitMessage: string;
  sourceSummaries: ChunkSummary[];
}
