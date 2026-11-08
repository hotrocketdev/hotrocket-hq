import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a program without a shell. Never throws; check `ok`. */
export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; input?: string } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs ?? 20_000, maxBuffer: 8 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        const code = err && typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as NodeJS.ErrnoException).code) : err ? null : 0;
        resolve({ ok: !err, code: err ? (code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr || (err && !stderr ? err.message : "")) });
      },
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

/** True when `cmd` is on PATH. */
export async function has(cmd: string): Promise<boolean> {
  const r = process.platform === "win32" ? await run("where", [cmd], { timeoutMs: 5000 }) : await run("sh", ["-c", `command -v ${cmd}`], { timeoutMs: 5000 });
  return r.ok && r.stdout.trim().length > 0;
}

/** Quotes a value for a POSIX shell command line. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Launchers (GUI apps, some shells, service wrappers) often start HQ with a PATH
 * that is missing the folders CLI tools are installed into — npm's global bin,
 * ~/.local/bin, Homebrew on Apple silicon, Docker Sandboxes on Windows. `where`
 * and `command -v` then report a working tool as "not installed", so the setup
 * checklist lies. Add those folders to this process's PATH once, at startup.
 */
export function augmentPath(): void {
  const home = homedir();
  const extra =
    process.platform === "win32"
      ? [
          join(home, ".local", "bin"),
          join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "DockerSandboxes", "bin"),
          join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "npm"),
          join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs"),
        ]
      : [join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", join(home, "bin")];
  const current = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const missing = extra.filter((dir) => existsSync(dir) && !current.includes(dir));
  if (missing.length) process.env.PATH = [...missing, ...current].join(delimiter);
}
