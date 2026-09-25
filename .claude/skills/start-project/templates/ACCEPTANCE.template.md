# <Title> — Acceptance criteria

Every criterion is binary and has at least one test whose title contains `[AC-xx]`.
`pnpm verify <slug>` fails if any AC id below is not referenced by a test.

| ID | Criterion | Level | Test file |
|---|---|---|---|
| AC-01 | <observable behaviour> | unit | tests/unit/<file>.test.ts |
