// An agent's env file: KEY=value lines, 0600, in HQ's home (~/.hrhq/<project>/<agent>.env).
//
// Two jobs, one file: credentials for the agent's own CLI (an API key, or a
// custom endpoint such as DeepSeek through Claude Code) and app variables the
// code it writes needs. Values never go into .hrhq/config.json, which is meant
// to be committed.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** KEY=value, # comments and blanks skipped; quotes around a value are dropped. Mirrors sbx --env-file. */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!KEY.test(key)) continue;
    let value = line.slice(eq + 1);
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))
      value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function readEnvFile(file: string | null | undefined): Record<string, string> {
  if (!file || !existsSync(file)) return {};
  return parseEnvText(readFileSync(file, "utf8"));
}

/** A copy of `base` with the env file's variables on top (the file wins, as it does for sbx). */
export function withEnvFile(base: Record<string, string>, file: string | null | undefined): Record<string, string> {
  const fromFile = readEnvFile(file);
  return Object.keys(fromFile).length ? { ...base, ...fromFile } : base;
}

/**
 * Sets (string) or removes (null) keys, keeping the file's comments, order and anything it
 * didn't mention. Written to a temp file and renamed, so a crash can't leave half a file.
 */
export function writeEnvEntries(file: string, entries: Record<string, string | null>): void {
  const exists = existsSync(file);
  const before = exists ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const header = exists
    ? []
    : [
        `# Credentials and app variables for this agent. One KEY=value per line.`,
        `# This file stays on this machine (0600) and is never committed.`,
        `# Sandbox agents read it when their sandbox starts: restart the agent after editing.`,
        `# Leave it empty to use the CLI's own signed-in account.`,
        ``,
      ];

  const pending = { ...entries };
  const out: string[] = [];
  for (const line of [...header, ...before]) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    const key = eq > 0 ? trimmed.slice(0, eq).trim() : "";
    if (!key || trimmed.startsWith("#") || !(key in pending)) {
      out.push(line);
      continue;
    }
    const value = pending[key];
    delete pending[key];
    if (value !== null) out.push(`${key}=${value}`); // null = remove the line
  }

  for (const [key, value] of Object.entries(pending)) {
    if (value !== null) out.push(`${key}=${value}`);
  }

  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

/** What a person would call the credentials in this file, or null for "the CLI's own account". */
export function providerLabel(env: Record<string, string>): string | null {
  const base = (env.ANTHROPIC_BASE_URL ?? env.ANTHROPIC_API_URL ?? "").toLowerCase();
  if (base.includes("deepseek")) return "DeepSeek (via Claude Code)";
  if (base.includes("openrouter")) return "OpenRouter (via Claude Code)";
  if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY) return base ? `API: ${new URL(base).host}` : "Claude API key";
  if (env.OPENAI_API_KEY || env.OPENAI_BASE_URL) return "OpenAI API key";
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return "Gemini API key";
  return null;
}

/** Key names in the file, for the settings panel. Never returns values. */
export function envKeys(file: string | null | undefined): string[] {
  return Object.keys(readEnvFile(file)).sort();
}

/** True when an env file exists but has no variables left in it. */
export function envIsEmpty(file: string | null | undefined): boolean {
  return envKeys(file).length === 0;
}
