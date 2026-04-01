# gac

CLI to generate one Conventional Commit subject line from git diff.

## Usage

```bash
pnpm install
pnpm build
pnpm dev
```

To install the local CLI command:

```bash
pnpm link --global
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
pnpm dev -- --commit
```

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
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)

This repository includes a default `.gac.config`.

Example:

```dotenv
# ~/.gac.config or <project>/.gac.config
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

You can also set values directly in your shell:

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=your-openai-api-key
```
