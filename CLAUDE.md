# jib-lab — agent guide

Monorepo of small, recordable demo projects posted on social networks (Corvus Interactive).
Ideas live in Notion → "Social Post Ideas" (`collection://64829b78-88ee-4fa9-bae4-9601a18ffb6e`).

## Output style (always on)
`.claude/skills/i-have-adhd/SKILL.md` applies to every reply and every subagent report
(injected by the SessionStart hook; subagents use `.claude/workflow/report-format.md`).

## Layout
```
apps/<slug>/            one Next.js app per project (created by `pnpm new-project`)
  SPEC.md ACCEPTANCE.md WORKPLAN.json tests.lock.json .phase
  src/ app/ tests/unit tests/e2e
packages/jev            Jev (TypeSafe System One) decisions: question builders, simulated + live providers, audit log, Next route bridge
packages/demo-kit       seeded RNG, virtual clock, scenario timelines (deterministic demos)
packages/ui             DemoShell, ScenarioControls/useScenarioPlayer, ProbabilityBars, DecisionLogPanel, styles.css
packages/tsconfig       shared TS configs
templates/next-app      app scaffold
scripts/                new-project · projects · verify
projects.json           registry: slug ↔ Notion page ↔ port ↔ phase
.claude/                agents, skills (start-project, verify-project, notion-sync, i-have-adhd), hooks
```

## Commands
| Need | Command |
|---|---|
| List projects & phases | `pnpm projects` |
| Start a project (full workflow) | `/start-project <slug>` |
| Scaffold only | `pnpm new-project <slug> --hook "..."` |
| All gates for an app | `pnpm verify <slug>` (`--no-e2e` for fast loop) |
| Shared packages gates | `pnpm verify shared` |
| Run an app | `pnpm --filter @jib-app/<slug> dev` |
| Lint / format | `pnpm lint` / `pnpm lint:fix` (Biome) |

## Workflow (see `.claude/skills/start-project/SKILL.md`)
`spec` (spec-writer) → `tests` (test-author, then lock) → `harness` (harness-engineer) →
`implement` (N parallel implementers, one per WORKPLAN package, in dependency waves) → `review` (reviewer) → `done`.
`apps/<slug>/.phase` holds the phase. During `implement`/`review`, a PreToolUse hook blocks edits to
`tests/`, `SPEC.md`, `ACCEPTANCE.md`, `tests.lock.json`.

## Conventions
- TypeScript strict, ESM, Biome formatting (2 spaces, double quotes, 100 cols).
- Domain logic is pure and deterministic: no `Math.random`/`Date.now` — use `@jib/demo-kit`.
- Demos run offline on `createSimulatedProvider`; live Jev only server-side via `app/api/jev/route.ts`
  when `TYPESAFE_API_KEY` is set (`JEV_MODE=simulated` forces simulation). Never ship a key to the client.
- Test titles carry acceptance tags: `it("[AC-03] …")`.
- Reuse shared packages before writing new UI/infra; propose shared changes as "Harness requests".
- Playwright is pinned to 1.56.1 (matches the preinstalled Chromium in cloud sessions).
- Playwright MCP (`.mcp.json`) is for visual review; set `JIB_CHROMIUM_PATH` locally if Chromium is elsewhere.
