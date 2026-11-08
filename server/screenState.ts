// Reading an agent's terminal screen: is it busy, waiting on a question, or
// waiting on a first-run trust prompt? Kept apart from sessions.ts so it can be
// tested against real screens (scripts/screen-state-test.ts).

export interface ScreenState {
  /** A turn is running (the CLI's interrupt footer is up). */
  busy: boolean;
  /** Something is asking the user: a question, a permission prompt or a trust prompt. */
  dialog: boolean;
  /** The dialog is a first-run "do you trust this folder" screen: the answer is always Yes. */
  trust: boolean;
  /** The normal input prompt is up, so typed text lands. */
  promptReady: boolean;
}

const BUSY = /esc to interrupt/i; // the footer while a turn runs

// A question or permission prompt (Claude Code's wording; the numbered-option line also covers Codex's).
const DIALOG = /Enter to select|↑\/↓ to navigate|Do you want to (proceed|make this edit|create)|Would you like to|^\s*[❯›]\s*1\.\s/im;

/**
 * First-run screens: Claude Code's "Security guide" (2.x) and Codex's folder/hook prompts.
 * Matched only together with the confirm footer below: the words stay in the scrollback after the
 * user has answered, so the option line is what says the screen is still waiting.
 */
const TRUST = /Security guide|Yes, I trust this folder|Do you trust the files in this folder|Do you trust the contents of this directory|Hooks need review/i;
const CONFIRM = /Enter to confirm|Esc to cancel|↑\/↓ to navigate|Press enter to continue/i;

// The input prompt is up. The footer words can be cut off in a short terminal, so an input line
// counts too — any dialog that also draws one (a trust screen, a permission prompt) is caught above.
const PROMPT_READY = /⏵⏵|\? for shortcuts|Ask Codex to do anything|^\s*❯\s/m;

/**
 * The last few lines that have text on them. A first-run prompt lives at the bottom of the
 * screen; once it's answered its words scroll up and stay in the buffer, so only the tail counts.
 */
function tail(screen: string, lines: number): string {
  return screen
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-lines)
    .join("\n");
}

export function readScreen(screen: string): ScreenState {
  const bottom = tail(screen, 4);
  const trust = TRUST.test(bottom) && CONFIRM.test(bottom);
  const dialog = DIALOG.test(screen) || trust;
  return {
    busy: BUSY.test(screen),
    dialog,
    trust,
    // A dialog that draws an ❯ line is not an invitation to type.
    promptReady: !dialog && PROMPT_READY.test(screen),
  };
}
