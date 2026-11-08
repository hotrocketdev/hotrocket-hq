// Reads agent screens the way HQ does when a hook is missed: is the agent busy,
// asking a question, or stuck on a first-run trust prompt? The fixtures are real
// screens (Claude Code 2.1.319, Codex), including the scrollback case where the
// trust words stay on screen after the user has answered.
//
//   npx tsx scripts/screen-state-test.ts

import { readScreen } from "../server/screenState";

let failed = 0;

function check(name: string, screen: string, want: { busy?: boolean; dialog?: boolean; trust?: boolean; promptReady?: boolean }) {
  const got = readScreen(screen);
  const bad = Object.entries(want).filter(([k, v]) => got[k as keyof typeof got] !== v);
  if (bad.length) {
    failed += 1;
    console.log(`✗ ${name}: ${bad.map(([k, v]) => `${k} wanted ${v}, got ${got[k as keyof typeof got]}`).join("; ")}`);
    return;
  }
  console.log(`✓ ${name}`);
}

// Claude Code 2.1.319, first start in a folder HQ hasn't run in before.
const claudeTrust = `Security guide

❯ Yes, I trust this folder

Enter to confirm · Esc to cancel`;

// The same words in the scrollback after the user answered: no option line, so it's not a prompt.
const claudeAnswered = `Security guide
❯ Yes, I trust this folder
Enter to confirm · Esc to cancel
Welcome to Claude Code
──────────────
❯ Try "how does <filepath> work?"`;

const claudeIdle = `❯ Try "how does <filepath> work?"

  ⏵⏵ accept edits on (shift+tab to cycle) · ? for shortcuts`;

const claudeBusy = `· Wibbling… (esc to interrupt · 12s · ↑ 3.1k tokens)`;

const claudePermission = `Do you want to create README.md?

❯ 1. Yes
  2. No, and tell Claude what to do differently (esc)`;

const codexTrust = `Do you trust the contents of this directory?

Press enter to continue`;

const codexReady = `Ask Codex to do anything`;

check("Claude first-run trust screen asks for you", claudeTrust, { trust: true, dialog: true, busy: false, promptReady: false });
check("Claude after answering: trust words in scrollback are not a prompt", claudeAnswered, { trust: false, dialog: false, busy: false, promptReady: true });
check("Claude idle prompt", claudeIdle, { dialog: false, busy: false, promptReady: true });
check("Claude busy footer", claudeBusy, { busy: true, dialog: false });
check("Claude permission dialog", claudePermission, { dialog: true, trust: false, busy: false });
check("Codex folder trust", codexTrust, { trust: true, dialog: true });
check("Codex ready prompt", codexReady, { promptReady: true, dialog: false });

if (failed) {
  console.log(`\n${failed} screen check(s) failed`);
  process.exit(1);
}
console.log("\nall screen checks passed");
