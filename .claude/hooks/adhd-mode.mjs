#!/usr/bin/env node
// SessionStart: inject the vendored i-have-adhd ruleset (always-on for jib-lab).
// Never blocks session start.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const skill = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "skills",
    "i-have-adhd",
    "SKILL.md",
  );
  if (!existsSync(skill)) process.exit(0);
  const body = readFileSync(skill, "utf8")
    .replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, "")
    .trimEnd();
  process.stdout.write(
    'ADHD MODE ACTIVE (always-on in jib-lab). The ruleset below applies to every response and every subagent report. "stop adhd mode" turns it off for this session.\n\n' +
      `${body}\n`,
  );
} catch {
  process.exit(0);
}
