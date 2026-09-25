---
name: verify-project
description: Run and interpret the jib-lab quality gates for one app or the shared packages (test-lock, acceptance coverage, typecheck, lint, unit, e2e). Use before any commit/push or when asked "is <project> done / green?".
argument-hint: <slug|shared> [--no-e2e]
---

# verify-project

1. Run `pnpm verify <slug>` (or `pnpm verify shared`). Add `--no-e2e` for a fast loop.
2. Read the summary block at the end: one line per gate.

| Gate | Fails when | Fix owner |
|---|---|---|
| test-lock | a file in `tests/` differs from `tests.lock.json` | revert, or run an Amendment (`start-project`) |
| acceptance-coverage | an `AC-xx` in ACCEPTANCE.md has no test titled `[AC-xx]` | test-author |
| typecheck / lint | TS or Biome errors | whoever owns the file (WORKPLAN `owns`) |
| unit | Vitest failures | implementer of the AC's package |
| e2e | Playwright failures (built app, `JEV_MODE=simulated`) | reviewer / implementer |

3. Report with the i-have-adhd shape: first line = gates passed/failed count, then failing gates with the first error line each, then one `Next:` action.
