# gac

CLI to generate one Conventional Commit subject line from git diff.

## Install

```bash
npm install -g gac
```

## Usage

```bash
gac
```

By default it reads staged changes (`git diff --cached --no-ext-diff`).
If staged changes are empty, it falls back to unstaged (`git diff --no-ext-diff`).

Disable fallback:

```bash
pnpm dev -- --no-unstaged-fallback
```

Commit with the generated message (explicit opt-in):

```bash
gac --commit
```

After generating a subject, `gac` prints LLM usage metrics to `stderr`:
request count and token totals (`prompt`, `completion`, `total`).

## LLM Config

`gac` reads environment-style settings from `.gac.config`.

Discovery order is from `~` to the current project directory.
For example, if your project is `~/workspace/app`, `gac` checks:

1. `~/.gac.config`
2. `~/workspace/.gac.config`
3. `~/workspace/app/.gac.config`

If you run `gac` from a nested subdirectory, discovery still stops at the git project root.

Nearest file wins when the same key appears multiple times.
Process environment variables still have highest precedence.

Supported keys:

- `LLM_PROVIDER`: `mock` or `openai`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `MAXIMUM_TITLE_LENGTH` (default: `80`)

Sensitive settings are environment-only:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)

This repository includes a default `.gac.config`.

Example:

```bash
# ~/.gac.config or <project>/.gac.config
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4.1-mini
```

You can also set values directly in your shell:

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=your-openai-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1
```

## Local development

```bash
pnpm install
pnpm build
pnpm dev
```

## Release check (pre-publish)

Run the full verification flow that blocks `npm publish` on failures:

```bash
pnpm release:check
```
