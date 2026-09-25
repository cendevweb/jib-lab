#!/usr/bin/env node
// Usage: pnpm new-project <slug> [--hook "..."]
// Scaffolds apps/<slug> from templates/next-app using the registry entry.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findProject, loadRegistry, ROOT, saveRegistry, walk } from "./lib.mjs";

const [slug] = process.argv.slice(2);
if (!slug) {
  console.error('usage: pnpm new-project <slug> [--hook "..."]');
  process.exit(1);
}
const hookIdx = process.argv.indexOf("--hook");
const hook = hookIdx > 0 ? process.argv[hookIdx + 1] : "";
const reg = loadRegistry();
const project = findProject(reg, slug);
const dest = join(ROOT, "apps", slug);
if (existsSync(dest)) {
  console.error(`apps/${slug} already exists`);
  process.exit(1);
}
cpSync(join(ROOT, "templates", "next-app"), dest, { recursive: true });
const vars = {
  __SLUG__: slug,
  __TITLE__: project.title,
  __HOOK__: hook.replaceAll('"', "'"),
  __PORT__: String(project.port),
  __NOTION__: project.notion,
};
for (const file of walk(dest)) {
  let s = readFileSync(file, "utf8");
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(k, v);
  writeFileSync(file, s);
}
writeFileSync(join(dest, ".phase"), "spec\n");
project.app = `apps/${slug}`;
project.phase = "spec";
saveRegistry(reg);
console.log(`Scaffolded apps/${slug} (port ${project.port}). Next: pnpm install`);
