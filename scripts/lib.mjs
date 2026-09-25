import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRY = join(ROOT, "projects.json");

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}
export function saveRegistry(reg) {
  writeFileSync(REGISTRY, `${JSON.stringify(reg, null, 2)}\n`);
}
export function findProject(reg, slug) {
  const p = reg.projects.find((x) => x.slug === slug);
  if (!p) {
    console.error(
      `Unknown project "${slug}". Known: ${reg.projects.map((x) => x.slug).join(", ")}`,
    );
    process.exit(1);
  }
  return p;
}
export function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out.sort();
}
/** sha256 per test file, relative to the app dir. */
export function hashTests(appDir) {
  const files = walk(
    join(appDir, "tests"),
    (p) => /\.(ts|tsx|json)$/.test(p) && !p.includes("__snapshots__"),
  );
  return Object.fromEntries(
    files.map((f) => [
      relative(appDir, f),
      createHash("sha256").update(readFileSync(f)).digest("hex"),
    ]),
  );
}
