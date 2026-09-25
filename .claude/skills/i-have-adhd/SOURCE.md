# Source

Vendored from https://github.com/ayghri/i-have-adhd (MIT, © 2026 Ayoub Ghriss),
commit `839872f9d1cd634fed642b4589ce7226199cc15f`, file `skills/i-have-adhd/SKILL.md`.

In jib-lab the ruleset is **always on**:

- `.claude/hooks/adhd-mode.mjs` injects it at every SessionStart (startup/resume/clear/compact).
- Every agent in `.claude/agents/` must apply it to its final report (subagents do not receive
  SessionStart context, so each agent file restates the obligation).

Turn off for one session: say "stop adhd mode". Turn off for the repo: remove the hook entry in
`.claude/settings.json`.
