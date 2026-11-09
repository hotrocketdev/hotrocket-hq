# AGENTS.md — HotRocket HQ

HotRocket HQ is Jorge's fork of **JSM HQ** (`jsmastery-pro/jsm-hq`): a pixel-art dashboard that runs a
team of AI coding agents (Claude Code / Codex) on a git repo, each in its own Docker Sandbox or Local
mode, following the PRs they open.

- Repo: `C:\Projects\hotrocket-hq` · GitHub `hotrocketdev/hotrocket-hq` (fork; `upstream` → `jsmastery-pro/jsm-hq`)
- Windows host: run HQ from a real console (`node bin/hotrocket-hq.mjs --repo <dir> --port 7421`);
  port 7420 is usually taken by an old `npx` instance.
- Vault: project `hotrocket-hq`, lane `core`, at `10-Projects/hotrocket-hq/` (handoffs + `upstream-inbox.md`).

## This lane: keeping up with upstream

A new chat in this project usually means "what's new upstream, and take it if it's worth taking".

1. **Report first, never merge unasked.** Run `node scripts/sync-upstream.mjs --digest` (read-only).
   It prints the commits upstream has (sha · date · author · subject), the diffstat, where the changes
   land by area, and a **careful** list of files in that set which this fork has patched. Summarise in
   plain English what the commits actually change, and say which of our behaviours to re-check.
   If it reports nothing, say so in one line and stop.
2. **Integrate only when asked.** `node scripts/sync-upstream.mjs` merges in a throwaway worktree cut
   from `origin/main` (the checkout is never touched), runs `rebrand.mjs`, installs, builds, tests,
   pushes a `sync/upstream-*` branch and opens a PR. Read its output and report the PR URL.
3. **Merge that PR with a merge commit, never a squash.** Squashing drops upstream's commits out of
   our history and the next sync re-attempts the same merge. If it happens anyway:
   `git merge -s ours upstream/main` restores the ancestry without touching the tree.

## Rules that keep the fork mergeable

- `scripts/rebrand.mjs` is the single source of truth for the name map (`jsm-hq` → `hotrocket-hq`,
  `JSM HQ` → `HotRocket HQ`, `jsmhq` → `hrhq`). Run `node scripts/rebrand.mjs --check` after any merge;
  exit 1 means something still needs renaming. Files that name the old project on purpose are skipped;
  a line that must keep it gets a `// rebrand-keep` comment.
- Never resolve an upstream conflict with `-X theirs`. Take upstream's logic, put our names back, and
  keep our own patches: `server/screenState.ts` + `readScreen`/`TRUST_NOTE` in `server/sessions.ts`,
  `augmentPath()` in `server/lib/exec.ts`, the env-file load in `server/backends/pty.ts`,
  `src/ui/settings/CredentialsSection.tsx`.
- PRs only, own branch, CI green before merge.

## Checks

```bash
node scripts/rebrand.mjs --check                                # nothing left to rename
npx tsx scripts/screen-state-test.ts                            # trust/question/busy screens
npx tsx scripts/agent-env-test.ts                               # credentials env file
npx tsx scripts/session-backend-test.ts && npx tsx scripts/workspace-test.ts
pnpm build                                                      # typecheck + Vite + server bundle
```

## Session start / end (vault handoffs)

```bash
node "C:/Users/jmont/AppData/Local/hermes/profiles/deepseek-flash/skills/productivity/vault-handoff/scripts/handoff.py" \
  board  --project hotrocket-hq
node ".../handoff.py" resume --project hotrocket-hq --lane core
```

At the end of a session, write the handoff for lane `core` (`--body-file <path>`, headings:
What happened / Features / changes / Bugs & problems / Setup & config to carry forward /
State right now / Next actions / Do not touch).
