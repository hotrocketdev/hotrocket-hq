# Contributing to HotRocket HQ

## Run it from source

Needs Node.js 20+ and pnpm 10 or 11 (`corepack enable` gets you pnpm).

```bash
git clone https://github.com/hotrocketdev/hotrocket-hq && cd hotrocket-hq
pnpm install
pnpm dev                                   # the UI with fake data, no agents
HQ_REPO=~/developer/hq-test pnpm dev:hq    # the real HQ server + UI, with hot reload
```

`pnpm dev` is a demo with fake data: nothing runs and nothing leaves the browser. To test a change for real, use `pnpm dev:hq` or `pnpm hq` against a throwaway repo.

| Command | Does |
| --- | --- |
| `pnpm dev` | Demo UI with fake data at http://localhost:5173 |
| `pnpm dev:hq` | Real HQ server + UI with hot reload (`HQ_REPO=<path>`) |
| `pnpm hq` | Builds the UI, then runs HQ like a release (`--repo <path> --port 7420`) |
| `pnpm build` | Type-checks, builds the UI to `dist/` and the server to `dist-server/` |
| `pnpm typecheck` | Type-check only |
| `npm pack` | Builds the npm tarball, to test it before publishing |

Start HQ with `HQ_DEBUG=1` to log why a queued message is waiting.

## Where things are

```
src/
  data/      Types, the OfficeDataSource interface, fake (data/mock) and real (data/ws) data
  store/     Zustand stores; the only code that talks to the data source
  office/    The PixiJS pixel office: layout, sprites, agents, belt
  ui/        Top bar, team panel, activity, drawers, settings, setup checklist, welcome
server/      Local HQ server: setup checks, workspaces, sessions (tmux, or HQ-run on Windows), sbx, hooks, Team MCP, GitHub
bin/         The hotrocket-hq command
docs/        User guides
context/     Implementation plans, and the first UI build brief (001-ui-build-context.md)
```

## Docker Sandboxes versions

HQ calls the `sbx` CLI and reads its output. sbx 0.48 changed several outputs (for example `sbx ls --json` and `sbx mcp ls --json` now return a bare array), so read sbx output in a way that accepts both the old and the new format. HQ is tested on sbx 0.47, 0.50 and 0.51.

## Updating from upstream

HotRocket HQ is a fork of [JSM HQ](https://github.com/jsmastery-pro/jsm-hq). The fork is renamed, so
upstream's commits arrive with our names and the old ones in the same files: the merge itself is
normal git, and the renaming is scripted instead of done by hand.

Add the upstream remote once:

```bash
git remote add upstream https://github.com/jsmastery-pro/jsm-hq.git
```

Then, from a clean `main`:

```bash
node scripts/sync-upstream.mjs --check   # is there anything new?
node scripts/sync-upstream.mjs           # merge, rebrand, build, test, push, open a PR
```

It merges `upstream/main` on a `sync/upstream-<date>-<sha>` branch, runs `scripts/rebrand.mjs`,
builds, runs the tests and opens a PR. Review the PR like any other: nothing is merged for you.

**When it conflicts**, it aborts rather than guessing, and lists the files. Resolve them with this
rule:

- take **upstream's logic** — it is usually a fix or a feature;
- put **our names** back — `node scripts/rebrand.mjs` does that for you once the merge is resolved;
- keep **our own changes** that live in the same files: the screen reader (`server/screenState.ts`,
  `readScreen` in `server/sessions.ts`, the trust note), `augmentPath()` in `server/lib/exec.ts`.
  If upstream rewrote one of those, re-apply it on top of their version.

`scripts/rebrand.mjs` is the single source of truth for the name mapping, and it is idempotent
(`--check` exits 1 when something is left to rename). Files that mention JSM HQ on purpose — our
`README.md`, `LICENSE`, `TRADEMARKS.md`, the sync scripts — are skipped, and any line can opt out
with a `rebrand-keep` comment.

`.github/workflows/sync-upstream.yml` does the same every Monday and opens the PR for you, or an
issue when a merge needs a person.

## Releasing

1. Bump `version` in `package.json` and merge to `main`.
2. From a clean, up-to-date `main`, run `npm publish`. It builds first.

Publishing needs write access to the `hotrocket-hq` package on npm (Hot Rocket Software's npm account). The README on npm updates only when a new version is published.
