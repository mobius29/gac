# Summary
<!-- What changed and why? Keep this focused on user-visible behavior or pipeline quality. -->

# Scope
<!-- Which modules are affected? -->

# Pipeline Impact
<!-- Describe impact on: collect diff -> preprocess -> split -> summarize -> filter/rank -> synthesize -->

# Noise Handling
<!-- Note lockfiles/generated/minified/sourcemaps/build/binary handling changes, if any. -->

# Conventional Commit Quality
<!-- Explain how this change improves intent extraction and subject-line quality. -->

# Verification
<!-- Paste exact commands run and key results. -->

```bash
pnpm test
pnpm typecheck
```

# Risks
<!-- Regressions, edge cases, or follow-up work. -->

# Thread Report
<!-- Required for scoped work from AGENTS.md -->

- Files changed:
- Verification run:
- Assumptions:
- Blockers:

# Checklist
- [ ] Large diff robustness is preserved or improved.
- [ ] Changes do not send one large raw diff to the model when quality or token limits may degrade.
- [ ] Pipeline stages remain explicit and separated by responsibility.
- [ ] Noise-heavy changes are filtered, downgraded, or summarized separately.
- [ ] Default output remains one concise Conventional Commit subject line.
- [ ] No auto-commit behavior was introduced without explicit opt-in.
- [ ] Provider logic remains replaceable/testable.
- [ ] Added or updated tests for non-trivial logic changes.
