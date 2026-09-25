#!/usr/bin/env node
// Usage:
//   pnpm verify <slug>            run every gate for one app
//   pnpm verify <slug> --no-e2e   skip Playwright (fast inner loop)
//   pnpm verify <slug> --lock     (test-author only) record test hashes in tests.lock.json
//   pnpm verify shared            gates for packages/*
//
// Gates: test-lock · acceptance coverage · typecheck · lint · unit · e2e
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findProject, hashTests, loadRegistry, ROOT, walk } from "./lib.mjs";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("usage: pnpm verify <slug|shared> [--no-e2e] [--lock]");
  process.exit(1);
}
const results = [];
const run = (name, cmd, cwd = ROOT) => {
  process.stdout.write(`\n▶ ${name}: ${cmd}\n`);
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, JEV_MODE: "simulated" },
  });
  results.push({ gate: name, ok: r.status === 0 });
  return r.status === 0;
};
const gate = (name, ok, detail = "") => {
  console.log(`\n${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  results.push({ gate: name, ok });
};

if (target === "shared") {
  run("typecheck", "pnpm --filter './packages/*' typecheck");
  run("lint", "pnpm exec biome check packages");
  run("unit", "pnpm --filter './packages/*' test");
} else {
  const project = findProject(loadRegistry(), target);
  if (!project.app) {
    console.error(`${target} has no app yet. Run: pnpm new-project ${target}`);
    process.exit(1);
  }
  const appDir = join(ROOT, project.app);
  const lockFile = join(appDir, "tests.lock.json");

  if (args.includes("--lock")) {
    writeFileSync(lockFile, `${JSON.stringify(hashTests(appDir), null, 2)}\n`);
    console.log(
      `Locked ${Object.keys(hashTests(appDir)).length} test files → ${project.app}/tests.lock.json`,
    );
    process.exit(0);
  }

  // 1. Test lock: tests written in phase 2 must not change during implementation.
  if (existsSync(lockFile)) {
    const locked = JSON.parse(readFileSync(lockFile, "utf8"));
    const now = hashTests(appDir);
    const changed = Object.keys({ ...locked, ...now }).filter((f) => locked[f] !== now[f]);
    gate(
      "test-lock",
      changed.length === 0,
      changed.length ? `changed: ${changed.join(", ")}` : "tests unchanged",
    );
  } else gate("test-lock", false, "tests.lock.json missing (test-author must run --lock)");

  // 2. Acceptance coverage: every AC-xx in ACCEPTANCE.md is referenced by at least one test title.
  const accFile = join(appDir, "ACCEPTANCE.md");
  if (existsSync(accFile)) {
    const ids = [...new Set(readFileSync(accFile, "utf8").match(/\bAC-\d{2,}\b/g) ?? [])];
    const testText = walk(join(appDir, "tests"), (p) => /\.(ts|tsx)$/.test(p))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const missing = ids.filter((id) => !testText.includes(`[${id}]`));
    gate(
      "acceptance-coverage",
      ids.length > 0 && missing.length === 0,
      missing.length ? `untested: ${missing.join(", ")}` : `${ids.length} criteria covered`,
    );
  } else gate("acceptance-coverage", false, "ACCEPTANCE.md missing");

  run("typecheck", "pnpm typecheck", appDir);
  run("lint", `pnpm exec biome check ${project.app}`);
  run("unit", "pnpm test", appDir);
  if (!args.includes("--no-e2e")) run("e2e", "pnpm test:e2e", appDir);
}

console.log("\n──────── verify summary ────────");
for (const r of results) console.log(`${r.ok ? "✔" : "✘"} ${r.gate}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} gate(s) failed.` : "\nAll gates passed.");
process.exit(failed ? 1 : 0);
