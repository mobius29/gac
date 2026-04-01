# AGENTS.md

## Mission

Build a CLI that reads git diff and generates one strong Conventional Commit subject line.

The highest priority is large-diff robustness and intent extraction quality.
Interactive UX is secondary.

## Non-negotiable product rules

1. Default input is staged diff: `git diff --cached --no-ext-diff`.
2. If staged diff is empty, fallback to `git diff --no-ext-diff`.
3. Never send a large raw diff to the model in one shot when quality or token limits may degrade.
4. Use the pipeline:
   collect diff -> preprocess -> split into chunks -> summarize chunks -> filter/rank -> synthesize final commit message
5. Chunk summaries must capture intent, not line-by-line narration.
6. Noise must be filtered, downgraded, or summarized separately:
   lockfiles, generated files, minified assets, sourcemaps, build output, binary changes
7. Default output is one concise Conventional Commit subject line.
8. Commit body generation is optional and not the main focus.
9. Do not auto-commit unless the user explicitly opts in.
10. LLM provider code must remain replaceable.

## Architecture rules

1. Use TypeScript throughout.
2. Use pnpm.
3. Keep CLI I/O separate from business logic.
4. Keep git access, preprocessing, chunking, prompt construction, provider logic, ranking, and synthesis separated by responsibility.
5. Prefer deterministic preprocessing and heuristics before model inference.
6. Keep functions small and single-purpose.
7. Add explicit types at module boundaries.
8. Write code that is testable without a real network call or real model.
9. Prefer mocks for subprocesses and providers in tests.
10. Do not silently swallow subprocess or parsing errors.

## Parallel thread rules

1. One thread owns one bounded deliverable.
2. Every task prompt must define:
   - allowed paths
   - forbidden paths
   - success criteria
3. Do not edit files outside allowed paths except for minimal import/type wiring that is strictly necessary.
4. Do not perform broad refactors across shared modules in a scoped thread.
5. If a shared interface blocks progress, prefer a thin adapter or the smallest compatible change.
6. Never revert unrelated changes.
7. Avoid reformatting untouched files.
8. Avoid renaming shared exports unless the prompt explicitly requires it.
9. If you must touch a shared file, keep the diff minimal and explain why in the final report.
10. If a task becomes blocked by another thread's area, stop expanding scope and report the blocker clearly.

## Default ownership map

- foundation:
  - package.json
  - tsconfig.json
  - vitest.config.ts
  - .gitignore
  - src/diff/types.ts

- git-preprocess:
  - src/git/**
  - src/diff/preprocess.ts
  - src/diff/noise.ts
  - tests for those modules

- split-rank:
  - src/diff/splitByFile.ts
  - src/diff/splitByHunk.ts
  - src/diff/rank.ts
  - tests for those modules

- llm-provider:
  - src/llm/**
  - tests for llm modules

- integrator:
  - src/pipeline/**
  - src/cli.ts
  - src/utils/**
  - pipeline/cli tests
  - minimal integration fixes if necessary

Prompt-level ownership overrides this map.

## Required behavior for every thread

1. Read this AGENTS.md first.
2. Read the files inside your allowed paths before editing.
3. Deliver working code, not plan-only output.
4. Add tests for non-trivial logic you change.
5. Run the smallest relevant verification commands for touched code.
6. If verification cannot run, state exactly why.
7. End with:
   - files changed
   - verification run
   - assumptions
   - blockers

## Fallback policy

1. If chunk summaries are weak, fall back to the highest-importance non-noise summary.
2. If all meaningful changes are noise, emit a safe `chore:` message.
3. If parsing fails, report a clear error instead of guessing recklessly.

## Definition of done

A scoped task is done only if:
- the feature works inside its assigned boundary
- touched tests pass, or a precise blocker is documented
- changes stay within allowed paths except minimal justified wiring
- the result improves the large-diff commit-message pipeline rather than adding unrelated UX
