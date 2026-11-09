// The agent env file: parsing (mirrors sbx --env-file), merging credentials in and out
// without disturbing comments or app variables, and what the settings panel calls the
// result. Runs on a temp file; touches nothing real.
//
//   npx tsx scripts/agent-env-test.ts

import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnvText, providerLabel, readEnvFile, withEnvFile, writeEnvEntries } from "../server/lib/envFile";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failed += 1;
    console.log(`✗ ${name}: got ${g}, wanted ${w}`);
    return;
  }
  console.log(`✓ ${name}`);
}

// ---------------------------------------------------------------- parsing

check(
  "comments, blanks and quoted values",
  parseEnvText('# a comment\r\n\r\nANTHROPIC_AUTH_TOKEN="sk abc"\r\nAPP_KEY=plain\r\n'),
  { ANTHROPIC_AUTH_TOKEN: "sk abc", APP_KEY: "plain" },
);
check("no expansion and spaces kept", parseEnvText("A=$HOME/x y"), { A: "$HOME/x y" });
check("bad key names are skipped", parseEnvText("2BAD=1\ngood_key=2\nno equals sign"), { good_key: "2" });
check("value keeps its own equals signs", parseEnvText("URL=https://x/?a=1&b=2"), { URL: "https://x/?a=1&b=2" });

// ---------------------------------------------------------------- merge in/out

const dir = mkdtempSync(join(tmpdir(), "hrhq-env-"));
const file = join(dir, "michael.env");

writeEnvEntries(file, { APP_KEY: "app-value", ANTHROPIC_AUTH_TOKEN: "sk-deepseek" });
check("writes both keys", readEnvFile(file), { APP_KEY: "app-value", ANTHROPIC_AUTH_TOKEN: "sk-deepseek" });

writeEnvEntries(file, { ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic", ANTHROPIC_MODEL: "deepseek-chat" });
check(
  "adds keys without touching the others",
  readEnvFile(file),
  { APP_KEY: "app-value", ANTHROPIC_AUTH_TOKEN: "sk-deepseek", ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic", ANTHROPIC_MODEL: "deepseek-chat" },
);

writeEnvEntries(file, { ANTHROPIC_AUTH_TOKEN: null, ANTHROPIC_MODEL: null, ANTHROPIC_BASE_URL: null });
check("clearing auth keys leaves app variables", readEnvFile(file), { APP_KEY: "app-value" });

const text = readFileSync(file, "utf8");
check("comments survive", text.includes("# Credentials and app variables"), true);
// Windows has no POSIX modes: npm/git there report 0o666 whatever chmod says.
if (process.platform !== "win32") check("file is 0600", statSync(file).mode & 0o777, 0o600);
else console.log("✓ file mode not checked on Windows (no POSIX permissions)");

// ---------------------------------------------------------------- what the panel shows

check("deepseek is named", providerLabel({ ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic", ANTHROPIC_AUTH_TOKEN: "x" }), "DeepSeek (via Claude Code)");
check("claude key is named", providerLabel({ ANTHROPIC_API_KEY: "sk-ant" }), "Claude API key");
check("openai key is named", providerLabel({ OPENAI_API_KEY: "sk" }), "OpenAI API key");
check("app variables alone mean account", providerLabel({ APP_KEY: "x" }), null);

// ---------------------------------------------------------------- what the agent process sees

const merged = withEnvFile({ PATH: "/bin", APP_KEY: "host-value" }, file);
check("env file wins over the host", merged.APP_KEY, "app-value");
check("host variables stay", merged.PATH, "/bin");
check("missing file is a no-op", withEnvFile({ A: "1" }, join(dir, "nope.env")), { A: "1" });

rmSync(dir, { recursive: true, force: true });

if (failed) {
  console.log(`\n${failed} env-file check(s) failed`);
  process.exit(1);
}
console.log("\nall env-file checks passed");
