// Re-applies HotRocket HQ's identity to code that came from upstream.
//
// Upstream (JSM HQ) writes its own names into the code: the npm scope, the
// `jsm-hq` bin, `~/.jsmhq` paths, "JSM HQ" in the UI and the agent prompts.
// When we merge an upstream change, the new lines arrive with their branding.
// Running this after every merge renames them again, so a merge is "take
// upstream, then rename" — no hand-editing, and the rename is one place.
//
//   node scripts/rebrand.mjs           rewrite files in place
//   node scripts/rebrand.mjs --check   list files that still need it, change nothing
//
// It is idempotent: on an already-rebranded tree it changes nothing.
// Files we own outright (our README, licences, this script, the sync workflow)
// are skipped: they mention JSM HQ on purpose, as attribution.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const check = process.argv.includes("--check");

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "dist-server", "pack", ".hrhq", ".jsmhq"]);

/** Files that deliberately mention the old names, or carry the mapping itself. */
const SKIP_FILES = new Set([
  "README.md",
  "CONTRIBUTING.md", // ours: explains the fork and the merge rule, so it names both projects
  "LICENSE",
  "TRADEMARKS.md",
  "scripts/rebrand.mjs",
  "scripts/sync-upstream.mjs",
  ".github/workflows/sync-upstream.yml",
  "package-lock.json",
]);

/** Order matters: the most specific strings first. */
const REPLACEMENTS = [
  ["@therealjsmastery/jsm-hq", "hotrocket-hq"],
  ["jsmastery-pro/jsm-hq", "hotrocketdev/hotrocket-hq"],
  ["jsmastery-pro/", "hotrocket/"],
  ["JSM HQ", "HotRocket HQ"],
  ["jsm-hq", "hotrocket-hq"],
  ["jsmhq", "hrhq"],
];

/** Upstream file paths that must be renamed if a merge brings them back. */
const FILE_RENAMES = [
  ["bin/jsm-hq.mjs", "bin/hotrocket-hq.mjs"],
  ["docs/jsmhq-context.md", "docs/product-spec.md"],
];

const TEXT_EXT = /\.(ts|tsx|mjs|js|css|html|json|md|yml|yaml|txt)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (TEXT_EXT.test(name)) {
      out.push(full);
    }
  }
  return out;
}

let changed = 0;
let checked = 0;

for (const full of walk(ROOT)) {
  const rel = relative(ROOT, full).split(sep).join("/");
  if (SKIP_FILES.has(rel)) continue;
  checked += 1;
  const before = readFileSync(full, "utf8");
  // A line can opt out with `rebrand-keep`: it needs the old name, e.g. to recognise
  // files written by an upstream version.
  const after = before
    .split("\n")
    .map((line) => {
      if (line.includes("rebrand-keep")) return line;
      let out = line;
      for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);
      return out;
    })
    .join("\n");
  if (after === before) continue;
  changed += 1;
  console.log(`${check ? "needs rebrand" : "rebranded"}: ${rel}`);
  if (!check) writeFileSync(full, after);
}

for (const [from, to] of FILE_RENAMES) {
  try {
    readFileSync(join(ROOT, from));
  } catch {
    continue; // not present (or already renamed)
  }
  console.log(`${check ? "needs rename" : "renamed"}: ${from} → ${to}`);
  changed += 1;
  if (!check) {
    const { renameSync } = await import("node:fs");
    renameSync(join(ROOT, from), join(ROOT, to));
  }
}

console.log(
  changed
    ? `\n${changed} file(s) ${check ? "still need" : "needed"} rebranding (${checked} scanned)`
    : `\nnothing to rebrand (${checked} files scanned)`,
);
process.exit(check && changed ? 1 : 0);
