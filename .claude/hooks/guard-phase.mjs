#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit): enforce the start-project workflow contract.
// While an app is in phase "implement" or "review", its tests, SPEC.md, ACCEPTANCE.md and
// tests.lock.json are frozen. Implementers must make the tests pass, not change them.
// To amend the spec/tests legitimately, the orchestrator sets apps/<slug>/.phase back to
// "tests" (see .claude/skills/start-project/SKILL.md § Amendments).
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const file = data?.tool_input?.file_path ?? data?.tool_input?.notebook_path;
    if (!file) process.exit(0);
    const root = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
    const rel = relative(root, resolve(root, file)).split("\\").join("/");
    const m = rel.match(/^apps\/([^/]+)\/(tests\/.*|SPEC\.md|ACCEPTANCE\.md|tests\.lock\.json)$/);
    if (!m) process.exit(0);
    const phaseFile = join(root, "apps", m[1], ".phase");
    const phase = existsSync(phaseFile) ? readFileSync(phaseFile, "utf8").trim() : "";
    if (phase === "implement" || phase === "review") {
      process.stderr.write(
        `Blocked: apps/${m[1]}/${m[2]} is frozen during phase "${phase}". ` +
          "Make the code satisfy the tests. If a test or the spec is wrong, stop and report it " +
          "(file, test id, why) in your final report so the orchestrator can run an amendment.\n",
      );
      process.exit(2);
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
