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
// It never touches your checkout: the work happens in a throwaway git worktree
// cut from origin/main, so it can run while you (or another agent) have a
// feature branch checked out here.
//
// If the merge conflicts, nothing is guessed: it aborts the merge, removes the
// worktree and tells you which files to resolve. Resolve them by hand, then run
// this again.
//
//   node scripts/sync-upstream.mjs             merge, rebrand, test, push, open a PR
//   node scripts/sync-upstream.mjs --check     only say whether upstream has news
//   node scripts/sync-upstream.mjs --no-build  skip install/build/tests (CI runs them on the PR)
//   node scripts/sync-upstream.mjs --no-pr     stop after the commit; the branch stays
//   node scripts/sync-upstream.mjs --no-push   stop after building
//   node scripts/sync-upstream.mjs --in-place  work on the current checkout instead of a worktree

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const noPr = args.has("--no-pr");
const noPush = args.has("--no-push") || noPr;
const noBuild = args.has("--no-build");
const inPlace = args.has("--in-place");

const UPSTREAM = "upstream";
const BRANCH = "main";

const step = (msg) => console.log(`\n• ${msg}`);

/** Repo commands run here: the worktree once it exists, the checkout before that. */
let cwd = process.cwd();

function git(...a) {
  return execFileSync("git", a, { encoding: "utf8", cwd }).trim();
}

function tryGit(...a) {
  try {
    return { ok: true, out: git(...a) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function tryGh(...a) {
  try {
    return { ok: true, out: execFileSync("gh", a, { encoding: "utf8", cwd: root }).trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function sh(cmd, a) {
  execFileSync(cmd, a, { stdio: "inherit", cwd });
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", cwd }).trim();

// ------------------------------------------------------------------ guards

if (!execFileSync("git", ["remote"], { encoding: "utf8", cwd }).split("\n").includes(UPSTREAM)) {
  console.error(`No "${UPSTREAM}" remote. Add it: git remote add ${UPSTREAM} https://github.com/jsmastery-pro/jsm-hq.git`);
  process.exit(1);
}

// ------------------------------------------------------------------ fetch

step(`fetching ${UPSTREAM} and origin`);
execFileSync("git", ["fetch", UPSTREAM, "--prune", "--tags"], { stdio: "inherit", cwd });
execFileSync("git", ["fetch", "origin", "--prune"], { stdio: "inherit", cwd });

const base = "origin/main";
const ahead = Number(execFileSync("git", ["rev-list", "--count", `${base}..${UPSTREAM}/${BRANCH}`], { encoding: "utf8", cwd }).trim());
if (ahead === 0) {
  console.log("Up to date — upstream has nothing new.");
  process.exit(0);
}

// A sync PR opened elsewhere (the weekly workflow, a cron run, yesterday's) is waiting for
// review. Merging again would open a duplicate, so stop and let a person decide.
const openSync = tryGh("pr", "list", "--state", "open", "--json", "number,title");
let syncPrs = [];
if (openSync.ok) {
  try {
    syncPrs = JSON.parse(openSync.out || "[]").filter((p) => typeof p?.title === "string" && p.title.startsWith("Upstream sync"));
  } catch {
    // gh printed something that isn't JSON (not signed in, network): carry on and let the push fail loudly.
  }
}
if (syncPrs.length) {
  console.log(`A sync PR is already open (#${syncPrs.map((p) => p.number).join(", #")}). Review or close it before syncing again.`);
  process.exit(0);
}

const incoming = execFileSync("git", ["log", "--oneline", "--no-decorate", `${base}..${UPSTREAM}/${BRANCH}`], { encoding: "utf8", cwd })
  .trim()
  .split("\n");
step(`${ahead} upstream commit(s) to bring in`);
for (const line of incoming.slice(0, 20)) console.log(`  ${line}`);
if (incoming.length > 20) console.log(`  … and ${incoming.length - 20} more`);

if (checkOnly) process.exit(0);

// ------------------------------------------------------------------ worktree

const short = execFileSync("git", ["rev-parse", "--short", `${UPSTREAM}/${BRANCH}`], { encoding: "utf8", cwd }).trim();
const syncBranch = `sync/upstream-${new Date().toISOString().slice(0, 10)}-${short}`;
const worktree = join(dirname(root), `${basename(root)}-sync-${short}`);

if (inPlace) {
  if (git("status", "--porcelain")) {
    console.error("--in-place with uncommitted changes. Commit or stash them first.");
    process.exit(1);
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") {
    console.error(`--in-place needs the main branch checked out (you're on ${branch}). Drop --in-place to use a worktree.`);
    process.exit(1);
  }
  step(`merging into ${syncBranch} here`);
  git("checkout", "-b", syncBranch);
} else {
  // Cut from origin/main, so whatever is checked out in the repo doesn't matter.
  if (existsSync(worktree)) {
    tryGit("worktree", "remove", "--force", worktree);
    rmSync(worktree, { recursive: true, force: true });
  }
  // A failed run leaves the branch behind; the next attempt for the same upstream commit
  // must be able to reuse that name instead of dying on "branch already exists".
  if (tryGit("rev-parse", "--verify", "--quiet", `refs/heads/${syncBranch}`).ok) {
    tryGit("branch", "-D", syncBranch);
  }
  step(`cutting a worktree from ${base} at ${worktree}`);
  const added = tryGit("worktree", "add", "-b", syncBranch, worktree, base);
  if (!added.ok) {
    console.error(`Couldn't create the worktree:\n${added.out}`);
    process.exit(1);
  }
  cwd = worktree;
}

function cleanup() {
  if (inPlace) return;
  tryGit("worktree", "remove", "--force", worktree);
  if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
  // The branch stays, so the work isn't lost.
}

// ------------------------------------------------------------------ merge

step(`merging ${UPSTREAM}/${BRANCH}`);
const merge = tryGit("merge", "--no-edit", `${UPSTREAM}/${BRANCH}`);
if (!merge.ok) {
  const conflicts = tryGit("diff", "--name-only", "--diff-filter=U").out.split("\n").filter(Boolean);
  tryGit("merge", "--abort");
  cleanup();
  tryGit("branch", "-D", syncBranch);
  console.error("\nUpstream changed lines this fork also changed. Nothing was merged.");
  if (conflicts.length) {
    console.error("Resolve these by hand (keep upstream's logic, put our names back), then run this again:");
    for (const f of conflicts) console.error(`  ${f}`);
  }
  console.error(
    "\nHints:\n  • a names-only conflict: take upstream's version, then `node scripts/rebrand.mjs`\n" +
      "  • our own fixes must survive: server/screenState.ts, readScreen/TRUST_NOTE in server/sessions.ts,\n" +
      "    augmentPath() in server/lib/exec.ts, the env-file load in server/backends/pty.ts",
  );
  process.exit(2);
}

// ------------------------------------------------------------------ rebrand

step("rebranding what upstream brought in");
const before = git("status", "--porcelain");
sh("node", ["scripts/rebrand.mjs"]);
const rebranded = git("status", "--porcelain") !== before;
if (rebranded) git("add", "-A");

// A sync PR merged with "squash" leaves upstream's commits out of main's history, so the count
// above keeps naming them for ever. Ask the real question instead: after merging and renaming,
// does this branch say anything main doesn't? If not, there is nothing to sync.
if (!git("status", "--porcelain") && tryGit("diff", "--quiet", base, "--", ".").ok) {
  console.log("\nUpstream has been merged already (its history was squashed): nothing new to bring in.");
  cleanup();
  process.exit(0);
}

// ------------------------------------------------------------------ build + tests

if (noBuild) {
  console.log("\n--no-build: skipping install, build and tests (CI runs them on the PR).");
} else {
  step("installing");
  sh("pnpm", ["install", "--frozen-lockfile"]);
  step("building");
  sh("pnpm", ["build"]);
  step("tests");
  sh("npx", ["tsx", "scripts/screen-state-test.ts"]);
  sh("npx", ["tsx", "scripts/agent-env-test.ts"]);
  sh("npx", ["tsx", "scripts/session-backend-test.ts"]);
  sh("npx", ["tsx", "scripts/workspace-test.ts"]);
}

// ------------------------------------------------------------------ commit

if (!rebranded) console.log("\nMerged with nothing to rebrand.");

const title = `Upstream sync: ${ahead} commit(s) from jsm-hq@${short}`;
const body = [
  `Brings in ${ahead} commit(s) from upstream (jsm-hq@${short}).`,
  "",
  ...incoming.slice(0, 50).map((l) => `- ${l}`),
  "",
  rebranded ? "Rebranded by scripts/rebrand.mjs after the merge." : "No rebranding was needed.",
  "",
  noBuild ? "Local build skipped; CI builds and tests this PR." : "Built and tested before pushing.",
  "",
  "**Merge this PR with a merge commit, not a squash.** Squashing drops upstream's commits out of",
  "the history, and the next sync re-attempts the same merge (recover with `git merge -s ours upstream/main`).",
].join("\n");

step("committing the sync branch");
git("commit", "-q", "-m", title, "-m", body);

if (noPush) {
  console.log(`\nCommitted on ${syncBranch}${inPlace ? "" : ` (worktree kept at ${worktree})`}. Review it, then push when you're happy.`);
  process.exit(0);
}

step("pushing");
git("push", "-u", "origin", syncBranch);
cleanup();

if (noPr) process.exit(0);

step("opening the PR");
execFileSync("gh", ["pr", "create", "--base", "main", "--head", syncBranch, "--title", title, "--body", body], { stdio: "inherit", cwd: root });
