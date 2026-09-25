#!/usr/bin/env node
// Usage: pnpm projects [--json]   — list the registry with local phase.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegistry, ROOT } from "./lib.mjs";

const reg = loadRegistry();
const rows = reg.projects.map((p) => {
  const phaseFile = p.app ? join(ROOT, p.app, ".phase") : null;
  const phase =
    phaseFile && existsSync(phaseFile) ? readFileSync(phaseFile, "utf8").trim() : p.phase;
  return { slug: p.slug, phase, port: p.port, shared: p.shared.join(",") || "-", title: p.title };
});
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else console.table(rows);
