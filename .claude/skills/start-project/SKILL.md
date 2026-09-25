---
name: start-project
description: Start (or resume) a jib-lab project from the Notion "Social Post Ideas" database. Runs the dynamic workflow spec → tests → harness → parallel implementers → review, with subagents, test lock and Notion sync. Use when the user says "commence / start / build <project>".
argument-hint: <slug or project name>
---

# /start-project — dynamic build workflow

You are the **orchestrator**. You coordinate subagents; you do not write the spec, tests or feature code yourself. Apply `.claude/skills/i-have-adhd/SKILL.md` to everything you tell the user (state restated each turn, one next action).

## 0. Resolve & scaffold (orchestrator, ~2 min)
1. Map the argument to a `slug` in `projects.json` (`pnpm projects`). Unknown → search Notion data source `collection://64829b78-88ee-4fa9-bae4-9601a18ffb6e`, add an entry (next free port), confirm with the user.
2. Resume if `apps/<slug>/.phase` exists: jump to that phase.
3. Otherwise `pnpm new-project <slug> --hook "<Notion Hook>"` then `pnpm install`.
4. Notion → `Status: Building` (skill `notion-sync`).
5. Create one task per phase with TaskCreate.

## 1. Spec — agent `spec-writer`
Spawn with: slug, Notion URL, path of `.claude/agents/spec-writer.md` ("read and follow it").
Gate: `SPEC.md`, `ACCEPTANCE.md`, `WORKPLAN.json` exist; WORKPLAN validates against `templates/WORKPLAN.schema.json` (`node .claude/skills/start-project/check-workplan.mjs <slug>`); `.phase` = `tests`.
Then post the agent's **Notion corrections** as one comment on the Notion page (`notion-sync`).

## 2. Tests — agent `test-author`
Gate: `tests.lock.json` exists and `pnpm verify <slug> --no-e2e` shows `test-lock ✔` and `acceptance-coverage ✔` (unit may fail). `.phase` = `harness`.

## 3. Harness — agent `harness-engineer`
Gate: `pnpm verify <slug> --no-e2e` → test-lock ✔, acceptance ✔, typecheck ✔, lint ✔; unit failures only "not implemented"/assertions. `.phase` = `implement` (this freezes tests via the PreToolUse hook).

## 4. Implement — dynamic fan-out of `implementer` agents
The work plan decides the shape of this phase — it is not fixed:
1. `node .claude/skills/start-project/check-workplan.mjs <slug> --waves` prints dependency waves.
2. For each wave, spawn **one implementer per package in parallel** (single message, several Agent calls, `run_in_background` true). Prompt: slug, package id, `.claude/agents/implementer.md`.
3. When a wave reports back: run `pnpm verify <slug> --no-e2e`. Package ACs still red → re-spawn that package's implementer with the failing output (max 2 retries), then escalate to the user.
4. An implementer reports a **test/spec defect** → Amendment (below), then resume.

## 5. Review — agent `reviewer`
`.phase` = `review`. Gate: `pnpm verify <slug>` all green (e2e included) and `.phase` = `done`.
Then: registry `phase: done`, Notion `Status: Ready to post`, commit (`feat(<slug>): …`), push.

## Amendments (spec or test is wrong)
1. Write `.phase` = `tests` (unfreezes). 2. Spawn `test-author` with the defect report, scoped to the named tests. 3. `pnpm verify <slug> --lock`. 4. `.phase` = `implement`. Record the amendment in `SPEC.md § Changelog`.

## Rules
- Subagents don't see this conversation: every prompt must be self-contained (slug, paths, what to read, what to return).
- Parallel agents only when their `owns` globs are disjoint.
- Never skip a gate. Never unfreeze tests to make a failing implementation pass.
- Commit at the end of phases 3 and 5 at minimum.
