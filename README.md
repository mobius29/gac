# gac

CLI that reads your git diff and generates one strong Conventional Commit subject line.

## Install

```bash
npm install -g @mobius29/gac
```

## Quick start

```bash
gac
```

Default diff source behavior:

1. reads staged diff: `git diff --cached --no-ext-diff`
2. if staged is empty, falls back to unstaged: `git diff --no-ext-diff`

Commit is explicit opt-in only:

```bash
gac --commit
```

Create a pull request against target branch:

```bash
gac --pr main
```

`--pr <target-branch>` behavior:

1. ensures current branch exists on `origin` (pushes with upstream if missing)
2. compares branch diff using `git diff <target-branch>...HEAD`
3. generates PR title and PR body from that diff
4. opens PR with generated title/body targeting `<target-branch>`

Create commit then open PR:

```bash
gac --commit --pr main
```

Disable unstaged fallback:

```bash
gac --no-unstaged-fallback
```

Show help:

```bash
gac --help
```

Enable pipeline debug metadata:

```bash
gac --debug
```

Shell completion:

```bash
# zsh (current session)
source <(gac --completion zsh)

# bash (current session)
source <(gac --completion bash)
```

After loading completion, typing `gac --pr <TAB>` shows branch names from `origin/*`.

After generating a subject, `gac` prints LLM usage metrics to `stderr`:
request count and token totals (`prompt`, `completion`, `total`).

## How it works

`gac` is optimized for large diffs and intent extraction, using this pipeline:

1. collect diff
2. preprocess/parse by file and hunk
3. split into bounded chunks
4. summarize chunks (intent-focused)
5. rank/filter summaries
6. synthesize one Conventional Commit subject

Noise-heavy files are downgraded or treated as noise (for example lockfiles, generated files, minified assets, sourcemaps, build artifacts, and binary changes).

Fallback behavior:

1. weak/invalid model output -> deterministic summary-based fallback
2. only noise changes -> safe `chore:` subject
3. parsing failure -> explicit error

## Configuration

`gac` reads environment-style settings from `.gac.config`.

Discovery order is from home directory to project root (nearest wins).  
Example for project `~/workspace/app`:

1. `~/.gac.config`
2. `~/workspace/.gac.config`
3. `~/workspace/app/.gac.config`

You can also point directly to a specific config file with:

- `GAC_CONFIG`
- `GIT_AUTO_COMMIT_CONFIG`

Environment variables always override file values.

Config keys:

- `LLM_PROVIDER` or `GIT_AUTO_COMMIT_LLM_PROVIDER`: `mock` or `openai`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `MAXIMUM_TITLE_LENGTH` or `GIT_AUTO_COMMIT_MAXIMUM_TITLE_LENGTH` (default: `80`)
- `OPENAI_API_KEY` (required for `openai`)
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)

Provider default:

- if `OPENAI_API_KEY` is set, provider defaults to `openai`
- otherwise provider defaults to `mock`

Example:

```bash
# ~/.gac.config or <project>/.gac.config
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4.1-mini
MAXIMUM_TITLE_LENGTH=80
```

Or via shell:

```bash
export OPENAI_API_KEY=your-openai-api-key
export OPENAI_MODEL=gpt-4.1-mini
```

## Local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev -- --help
```

## Release check

```bash
pnpm release:check
```
