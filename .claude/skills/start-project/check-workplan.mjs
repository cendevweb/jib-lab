#!/usr/bin/env node
// Validate apps/<slug>/WORKPLAN.json and optionally print dependency waves.
// Usage: node .claude/skills/start-project/check-workplan.mjs <slug> [--waves]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [slug] = process.argv.slice(2);
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const file = join(root, "apps", slug ?? "", "WORKPLAN.json");
const fail = (m) => {
  console.error(`✘ WORKPLAN: ${m}`);
  process.exit(1);
};
if (!slug || !existsSync(file)) fail(`missing ${file}`);
const plan = JSON.parse(readFileSync(file, "utf8"));
const pkgs = plan.packages;
if (!Array.isArray(pkgs) || pkgs.length < 1) fail("packages must be a non-empty array");
const ids = new Set();
for (const p of pkgs) {
  for (const k of ["id", "title", "owns", "dependsOn", "acceptance", "agent"])
    if (!(k in p)) fail(`${p.id ?? "?"}: missing "${k}"`);
  if (ids.has(p.id)) fail(`duplicate id ${p.id}`);
  ids.add(p.id);
  if (!p.owns.length) fail(`${p.id}: owns is empty`);
}
for (const p of pkgs)
  for (const d of p.dependsOn) if (!ids.has(d)) fail(`${p.id}: unknown dependency ${d}`);
// Overlap check on literal paths / glob prefixes.
const prefix = (g) => g.split("*")[0];
for (const a of pkgs)
  for (const b of pkgs)
    if (a.id < b.id)
      for (const ga of a.owns)
        for (const gb of b.owns) {
          const [pa, pb] = [prefix(ga), prefix(gb)];
          if (
            pa === pb ||
            (ga.includes("*") && pb.startsWith(pa)) ||
            (gb.includes("*") && pa.startsWith(pb))
          )
            fail(`${a.id} and ${b.id} both own ${ga} / ${gb}`);
        }
// Acceptance ids exist in ACCEPTANCE.md
const acc = readFileSync(join(root, "apps", slug, "ACCEPTANCE.md"), "utf8");
for (const p of pkgs)
  for (const id of p.acceptance) if (!acc.includes(id)) fail(`${p.id}: ${id} not in ACCEPTANCE.md`);
// Waves (Kahn).
const waves = [];
const done = new Set();
while (done.size < pkgs.length) {
  const wave = pkgs.filter((p) => !done.has(p.id) && p.dependsOn.every((d) => done.has(d)));
  if (!wave.length) fail("dependency cycle");
  for (const p of wave) done.add(p.id);
  waves.push(wave);
}
console.log(`✔ WORKPLAN valid: ${pkgs.length} packages, ${waves.length} waves`);
if (process.argv.includes("--waves")) {
  for (const [i, w] of waves.entries()) {
    const list = w.map((p) => `${p.id} (${p.acceptance.join(",")})`).join("  |  ");
    console.log(`wave ${i + 1}: ${list}`);
  }
}
