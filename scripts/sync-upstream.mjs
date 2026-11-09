// Pulls upstream's work (JSM HQ) into HotRocket HQ.
//
// A renamed fork doesn't conflict with upstream over *features*: it conflicts
// where both sides touched the same lines. This script keeps that cheap:
//
//   1. merge upstream/main on a sync branch (no rewrites, no force)
//   2. run scripts/rebrand.mjs, which renames any branding the new upstream
//      lines brought with them — so "take upstream, then rename" is automatic
//   3. build and run the tests
//   4. push the branch and open a PR you review
//
// If the merge conflicts, nothing is guessed: it aborts the merge and tells you
// which files to resolve. Resolve them (upstream's code, our names), then run
// this again — it will reuse the work.
//
//   node scripts/sync-upstream.mjs             merge, rebrand, test, push, open a PR
//   node scripts/sync-upstream.mjs --no-pr     stop after the commit
//   node scripts/sync-upstream.mjs --no-push   stop after building
//   node scripts/sync-upstream.mjs --check     only say whether upstream has news
//   node scripts/sync-upstream.mjs --no-build  merge and rebrand without the build + tests

import { execFileSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const noPr = args.has("--no-pr");
const noPush = args.has("--no-push") || noPr;
const noBuild = args.has("--no-build"); // for a quick merge-and-rebrand, without the 3-minute build

const UPSTREAM = "upstream";
const UPSTREAM_BRANCH = "main";

const step = (msg) => console.log(`\n• ${msg}`);

function git(...a) {
  return execFileSync("git", a, { encoding: "utf8" }).trim();
}

function tryGit(...a) {
  try {
    return { ok: true, out: git(...a) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function sh(cmd, a) {
  execFileSync(cmd, a, { stdio: "inherit" });
}

// ------------------------------------------------------------------ guards

if (git("status", "--porcelain")) {
  console.error("The tree has uncommitted changes. Commit or stash them first.");
  process.exit(1);
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") {
  console.error(`Switch to main first (you're on ${branch}).`);
  process.exit(1);
}

if (!git("remote").split("\n").includes(UPSTREAM)) {
  console.error(`No "${UPSTREAM}" remote. Add it: git remote add ${UPSTREAM} https://github.com/jsmastery-pro/jsm-hq.git`);
  process.exit(1);
}

// ------------------------------------------------------------------ fetch

step(`fetching ${UPSTREAM}`);
git("fetch", UPSTREAM, "--prune", "--tags");

const ahead = Number(git("rev-list", "--count", `HEAD..${UPSTREAM}/${UPSTREAM_BRANCH}`));
if (ahead === 0) {
  console.log("Up to date — upstream has nothing new.");
  process.exit(0);
}

const incoming = git("log", "--oneline", "--no-decorate", `HEAD..${UPSTREAM}/${UPSTREAM_BRANCH}`).split("\n");
step(`${ahead} upstream commit(s) to bring in`);
for (const line of incoming.slice(0, 20)) console.log(`  ${line}`);
if (incoming.length > 20) console.log(`  … and ${incoming.length - 20} more`);

if (checkOnly) process.exit(0);

// ------------------------------------------------------------------ merge

const short = git("rev-parse", "--short", `${UPSTREAM}/${UPSTREAM_BRANCH}`);
const syncBranch = `sync/upstream-${new Date().toISOString().slice(0, 10)}-${short}`;
step(`merging into ${syncBranch}`);
git("checkout", "-b", syncBranch);

const merge = tryGit("merge", "--no-edit", `${UPSTREAM}/${UPSTREAM_BRANCH}`);
if (!merge.ok) {
  const conflicts = tryGit("diff", "--name-only", "--diff-filter=U").out.split("\n").filter(Boolean);
  tryGit("merge", "--abort");
  tryGit("checkout", "main");
  tryGit("branch", "-D", syncBranch);
  console.error("\nUpstream changed lines this fork also changed. Nothing was merged.");
  if (conflicts.length) {
    console.error("Resolve these by hand (keep upstream's logic, put our names back), then run this again:");
    for (const f of conflicts) console.error(`  ${f}`);
  }
  console.error(`\nHints:\n  • a names-only conflict: take upstream's version, then \`node scripts/rebrand.mjs\`\n  • our own fixes (screenState.ts, augmentPath, TRUST_NOTE, readScreen) must survive: re-apply them on top of upstream's version`);
  process.exit(2);
}

// ------------------------------------------------------------------ rebrand

step("rebranding what upstream brought in");
const before = git("status", "--porcelain");
sh("node", ["scripts/rebrand.mjs"]);
const rebranded = git("status", "--porcelain") !== before;

if (rebranded) git("add", "-A");

// ------------------------------------------------------------------ build + tests

if (noBuild) {
  console.log("\n--no-build: skipping install, build and tests.");
} else {
  step("installing");
  sh("pnpm", ["install", "--frozen-lockfile"]);

  step("building");
  sh("pnpm", ["build"]);

  step("tests");
  sh("npx", ["tsx", "scripts/screen-state-test.ts"]);
  sh("npx", ["tsx", "scripts/session-backend-test.ts"]);
  sh("npx", ["tsx", "scripts/workspace-test.ts"]);
}

// ------------------------------------------------------------------ commit

if (!rebranded) {
  console.log("\nMerged with nothing to rebrand.");
}

const title = `Upstream sync: ${ahead} commit(s) from jsm-hq@${short}`;
const body = [
  `Brings in ${ahead} commit(s) from upstream (jsm-hq@${short}).`,
  "",
  ...incoming.slice(0, 50).map((l) => `- ${l}`),
  "",
  rebranded ? "Rebranded by scripts/rebrand.mjs after the merge." : "No rebranding was needed.",
  "",
  "Built and tested before pushing.",
].join("\n");

step("committing the sync branch");
git("commit", "-q", "-m", title, "-m", body);

if (noPush) {
  console.log(`\nDone on ${syncBranch}. Review it, then push it when you're happy.`);
  process.exit(0);
}

step("pushing");
git("push", "-u", "origin", syncBranch);

if (noPr) process.exit(0);

step("opening the PR");
sh("gh", ["pr", "create", "--base", "main", "--head", syncBranch, "--title", title, "--body", body]);
