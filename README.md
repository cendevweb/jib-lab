# jib-lab

Monorepo for the Corvus Interactive "build in public" demos: one small, recordable project per
social post. Ideas come from the Notion database **Social Post Ideas**.

## Quick start
```sh
corepack enable && pnpm install
pnpm projects                 # list projects and their phase
pnpm verify shared            # gates for shared packages
pnpm --filter @jib-app/jev-agent-atc dev   # run a demo (port from projects.json)
```

## How a project gets built
With Claude Code: `/start-project <slug>` runs a dynamic, agent-based workflow:

1. **Spec** — `spec-writer` fixes the Notion idea into `SPEC.md`, `ACCEPTANCE.md`, `WORKPLAN.json`.
2. **Tests** — `test-author` writes failing unit + e2e tests tagged `[AC-xx]`, then locks them.
3. **Harness** — `harness-engineer` wires deps, config and contract stubs.
4. **Implement** — one `implementer` per work package, spawned in parallel dependency waves.
5. **Review** — `reviewer` runs every gate (incl. e2e), screenshots the demo, updates the README.

Gates (`pnpm verify <slug>`): test-lock · acceptance coverage · typecheck · lint · unit · e2e.

## Shared packages
| Package | What |
|---|---|
| `@jib/jev` | Typed Jev decisions (TypeSafe System One): simulated + live providers, audit log, Next.js route |
| `@jib/demo-kit` | Seeded RNG, virtual clock, scenario timelines |
| `@jib/ui` | Demo shell, scenario player, probability bars, decision log |

## Projects
See `projects.json` or `pnpm projects`.
