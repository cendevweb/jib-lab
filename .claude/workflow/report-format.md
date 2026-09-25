# Final report format (i-have-adhd, mandatory)

Your final message is read by the orchestrator and relayed to a reader with ADHD.
Apply `.claude/skills/i-have-adhd/SKILL.md` to it:

1. First line: the outcome in one sentence (`DONE:` / `BLOCKED:` / `PARTIAL:` + what).
2. Numbered list (≤ 5 items) of what now exists or works — concrete paths, commands, test ids.
3. `Gates:` one line with the verify results (e.g. `unit 42/42 ✔ · typecheck ✔ · lint ✔`).
4. `Issues:` only real blockers or spec/test defects, each with file + id + proposed fix.
5. Last line: `Next:` one concrete action for the orchestrator.

No preamble, no recap prose, no pleasantries.
