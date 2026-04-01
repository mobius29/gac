# git-auto-commit

CLI to generate one Conventional Commit subject line from git diff.

## Usage

```bash
pnpm install
pnpm build
pnpm dev
```

By default it reads staged changes (`git diff --cached --no-ext-diff`).
If staged changes are empty, it falls back to unstaged (`git diff --no-ext-diff`).

Disable fallback:

```bash
pnpm dev -- --no-unstaged-fallback
```
