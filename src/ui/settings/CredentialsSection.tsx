import { useEffect, useState } from "react";
import type { AgentConfig } from "../../data/types";
import { officeActions, useOffice } from "../../store/office";
import { Field } from "../kit";

/**
 * How this agent's CLI authenticates.
 *
 * The CLIs use whatever account they're signed into (`claude` login, `codex` login) — that is the
 * default and needs nothing here. This panel is for the other two cases: an API key instead of a
 * subscription, or a different model provider behind the same CLI (DeepSeek and OpenRouter both
 * speak Claude Code's protocol).
 *
 * Values are written to the agent's env file (HQ's home, 0600, git-excluded) and never to
 * .hrhq/config.json, which is meant to be committed. The browser only ever reads key names back.
 */

interface Preset {
  id: string;
  label: string;
  /** Filled in for you. */
  fixed: Record<string, string>;
  /** Asked for, one field each. */
  secrets: { key: string; label: string; placeholder: string }[];
  note: string;
}

const PRESETS: Preset[] = [
  {
    id: "deepseek",
    label: "DeepSeek (through Claude Code)",
    fixed: { ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic", ANTHROPIC_MODEL: "deepseek-chat" },
    secrets: [{ key: "ANTHROPIC_AUTH_TOKEN", label: "DeepSeek API key", placeholder: "sk-…" }],
    note: "DeepSeek has no agent CLI of its own; Claude Code talks to its Anthropic-compatible endpoint.",
  },
  {
    id: "openrouter",
    label: "OpenRouter (through Claude Code)",
    fixed: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api", ANTHROPIC_MODEL: "" },
    secrets: [{ key: "ANTHROPIC_AUTH_TOKEN", label: "OpenRouter key", placeholder: "sk-or-…" }],
    note: "Model must be a full id, e.g. anthropic/claude-sonnet-4.5.",
  },
  {
    id: "claude",
    label: "Claude API key",
    fixed: {},
    secrets: [{ key: "ANTHROPIC_API_KEY", label: "Anthropic API key", placeholder: "sk-ant-…" }],
    note: "Billed per token by Anthropic instead of using your Claude subscription.",
  },
  {
    id: "openai",
    label: "OpenAI API key (Codex)",
    fixed: {},
    secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key", placeholder: "sk-…" }],
    note: "Billed per token by OpenAI instead of using your ChatGPT subscription.",
  },
  {
    id: "custom",
    label: "Another variable…",
    fixed: {},
    secrets: [
      { key: "", label: "Name", placeholder: "SOME_KEY" },
      { key: "", label: "Value", placeholder: "…" },
    ],
    note: "Any KEY=value the CLI understands.",
  },
];

/** Keys that decide how the CLI authenticates; clearing them goes back to the signed-in account. */
const AUTH_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "OPENAI_API_KEY", "OPENAI_BASE_URL", "GEMINI_API_KEY"];

export function CredentialsSection({ agent }: { agent: AgentConfig }) {
  const creds = useOffice((s) => s.credentials[agent.id]);
  const [preset, setPreset] = useState<string>("deepseek");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Ask the server what's in the env file when this panel opens (or when the CLI changes).
  useEffect(() => {
    officeActions.inspectCredentials(agent.id);
  }, [agent.id, agent.cli, agent.mode]);

  const chosen = PRESETS.find((p) => p.id === preset) ?? PRESETS[0];

  const apply = () => {
    const entries: Record<string, string | null> = { ...chosen.fixed };
    for (const s of chosen.secrets) {
      const key = s.key || values[s.key]?.trim();
      const value = values[s.key]?.trim();
      if (!key) return setError("Give the variable a name.");
      if (key && !value) return setError(`${s.label} is empty.`);
      entries[key] = value;
    }
    officeActions.setAgentEnv(agent.id, entries);
    setValues({});
    setError(null);
  };

  const useAccount = () => {
    const clear: Record<string, string | null> = {};
    for (const k of AUTH_KEYS) clear[k] = null;
    officeActions.setAgentEnv(agent.id, clear);
    setError(null);
  };

  const keys = creds?.keys ?? [];

  return (
    <div className="col-span-2 border-t-2 border-dashed border-ink pt-3">
      <Field
        label="Credentials"
        hint={
          creds?.provider
            ? `This agent uses ${creds.provider}. Restart it after any change.`
            : creds
              ? `Using the ${agent.cli === "codex" ? "ChatGPT" : "Claude"} account this machine is signed into. Nothing to do unless you want an API key or another provider.`
              : "Checking…"
        }
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className={`border-2 border-ink px-2 py-0.5 ${creds?.provider ? "bg-[#fff3cf]" : "bg-cream-2"}`}>
              {creds?.provider ?? "Account"}
            </span>
            {keys.map((k) => (
              <span key={k} className="border-2 border-ink bg-white px-2 py-0.5 font-term text-[13px]" title="Set in the agent's env file">
                {k}
              </span>
            ))}
            {creds?.provider && (
              <button type="button" className="btn px-2 text-[12px]" onClick={useAccount}>
                Use the account instead
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <select className="field max-w-[280px]" value={preset} onChange={(e) => { setPreset(e.target.value); setValues({}); setError(null); }} aria-label="Credential type">
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {chosen.secrets.map((s) => (
              <input
                key={s.key || s.label}
                className="field min-w-[160px] flex-1 font-term text-[16px]"
                placeholder={s.placeholder}
                aria-label={s.label}
                value={values[s.key] ?? ""}
                onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
              />
            ))}
            <button type="button" className="btn px-2 text-[12px]" onClick={apply}>
              Save
            </button>
          </div>
          <p className="m-0 text-[12px] text-muted">{chosen.note}</p>
          {error && <p className="m-0 text-[12px] text-[#b3402f]">{error}</p>}
          <p className="m-0 text-[12px] text-muted">
            Stored in this agent's env file (0600, outside the repo) — never in <code>.hrhq/config.json</code>.{" "}
            <button type="button" className="underline" onClick={() => officeActions.openEnvFile(agent.id)}>
              Open the file
            </button>{" "}
            for app variables the code needs.
          </p>
        </div>
      </Field>
    </div>
  );
}
