import { z } from "zod";

const changeTypeEnum = z.enum(["feat", "fix", "refactor", "docs", "test", "chore"]);

export const chunkSummarySchema = z.object({
  whatChanged: z.string().min(3),
  whyLikely: z.string().min(3),
  probableType: changeTypeEnum,
  importance: z.number().int().min(1).max(10),
  isNoise: z.boolean(),
});

export const commitSubjectSchema = z
  .string()
  .trim()
  .regex(/^(feat|fix|refactor|docs|test|chore):\s+.+$/i, "Must be a Conventional Commit subject");

export type ParsedChunkSummary = z.infer<typeof chunkSummarySchema>;
