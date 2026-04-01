export type DiffInputSource = "staged" | "working-tree";

export type DiffChangeType =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "unmerged"
  | "unknown";

export type DiffChunkKind = "file" | "hunk";

export type DiffNoiseKind =
  | "lockfile"
  | "generated"
  | "minified"
  | "sourcemap"
  | "build-output"
  | "binary"
  | "other";

export interface DiffLineStats {
  added: number;
  deleted: number;
}

export interface CollectedDiffMetadata {
  source: DiffInputSource;
  usedFallback: boolean;
  command: string;
  collectedAt: string;
  fileCount: number;
  totalBytes: number;
}

export interface DiffChunk {
  id: string;
  kind: DiffChunkKind;
  filePath: string;
  previousFilePath?: string;
  changeType: DiffChangeType;
  header?: string;
  patch: string;
  lineStats: DiffLineStats;
  isBinary: boolean;
  noiseKind?: DiffNoiseKind;
}

export type SummaryImpact = "low" | "medium" | "high";

export type ConventionalCommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "perf"
  | "docs"
  | "test"
  | "build"
  | "ci"
  | "chore"
  | "revert"
  | "style";

export interface ChunkSummary {
  chunkId: string;
  intent: string;
  keyChanges: string[];
  impact: SummaryImpact;
  confidence: number;
  isNoise: boolean;
  suggestedType?: ConventionalCommitType;
}

export type SynthesisFallbackReason = "weak-summaries" | "noise-only";

export interface CommitSynthesisInput {
  metadata: CollectedDiffMetadata;
  summaries: ChunkSummary[];
  maxSubjectLength?: number;
  preferredScope?: string;
}

export interface CommitSynthesisOutput {
  subject: string;
  type: ConventionalCommitType;
  scope?: string;
  isBreakingChange: boolean;
  usedSummaryIds: string[];
  fallbackReason?: SynthesisFallbackReason;
}
