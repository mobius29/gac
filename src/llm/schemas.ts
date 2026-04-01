import { z } from "zod";

export const changeTypeSchema = z.enum(["feat", "fix", "refactor", "docs", "test", "chore"]);

export const chunkSummarySchema = z.object({
  whatChanged: z.string().min(3),
  whyLikely: z.string().min(3),
  probableType: changeTypeSchema,
  importance: z.number().int().min(1).max(10),
  isNoise: z.boolean(),
});

export const commitSubjectSchema = z
  .string()
  .trim()
  .regex(/^(feat|fix|refactor|docs|test|chore):\s+.+$/i, "Must be a Conventional Commit subject");

export type ChunkSummaryModelOutput = z.infer<typeof chunkSummarySchema>;
