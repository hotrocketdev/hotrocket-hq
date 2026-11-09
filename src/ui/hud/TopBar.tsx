import type { SimSpeed } from "../../data/source";
import { officeActions, selectAttention, useOffice } from "../../store/office";
import { ui, useUi } from "../../store/ui";

const SPEEDS: SimSpeed[] = [1, 2, 4];

function Logo() {
  return (
    <svg className="h-[30px] w-[30px] shrink-0" viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="1" width="8" height="8" fill="#241a2e" />
      <rect x="2" y="2" width="6" height="6" fill="#29adff" />
      <rect x="3" y="3" width="1" height="2" fill="#fff6e9" />
      <rect x="6" y="3" width="1" height="2" fill="#fff6e9" />
      <rect x="3" y="6" width="4" height="1" fill="#1d2b53" />
      <rect x="4" y="0" width="2" height="1" fill="#ffec27" />
    </svg>
  );
}

export function TopBar() {
  const snap = useOffice((s) => s.snap);
  const speed = useOffice((s) => s.speed);
  const hasDev = useOffice((s) => s.presets !== null);
  const planBoardId = useUi((s) => s.planBoardId);
  const attention = selectAttention(snap).total;
  const debugOpen = useUi((s) => s.debugOpen);
  const live = useOffice((s) => s.live);
  if (!snap) return null;
  const setupIssues = snap.setup.checks.filter((c) => c.status !== "ok").length;
  const stopped = snap.agents.filter((a) => a.session.state === "stopped" || a.session.state === "failed");

  // Live: count real running sessions. Mock: every agent counts as running.
  const runningIds = new Set(snap.agents.filter((a) => a.session.state === "running").map((a) => a.agentId));
  const sandboxes = snap.config.team.filter((a) => a.mode === "sandbox" && runningIds.has(a.id)).length;
  const local = snap.config.team.filter((a) => a.mode === "local" && runningIds.has(a.id)).length;
  const boards = [...snap.boards].sort((a, b) => a.order - b.order);
  const active = boards.filter((b) => b.status === "active");
  const openPrs = snap.pullRequests.filter((p) => !p.merged && !p.closed).length;

  return (
    <header className="panel no-scrollbar fixed left-4 right-4 top-[10px] z-10 flex h-[50px] items-center gap-1.5 overflow-x-auto px-2.5 xl:gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Logo />
        {/* The wordmark never shrinks: when the bar runs short the project name after it is what gives way. */}
        <b className="whitespace-nowrap text-[15px] font-bold tracking-[0.02em] xl:text-[16px]">HotRocket HQ</b>
        {!live && (
          <span className="chip shrink-0 text-[11px]" style={{ ["--c" as string]: "#ffec27" }} title="Running on mock data. Start the real HQ with `pnpm dev:hq`.">
            Demo data
          </span>
        )}
      </div>
      {/* The one item allowed to shrink, so a narrow window eats the repo path and not a control. */}
      <span className="min-w-0 shrink truncate text-[13px] text-muted">
        — <em className="font-semibold not-italic text-ink">{snap.config.project.name}</em>{" "}
        <span className="font-term text-[13px]">{snap.config.project.repo}</span>
      </span>
      <span className="hidden min-w-0 flex-1 sm:block" />

      {/* Below this the bar can't hold the plan-wall picker and Debug; both stay reachable (Boards drawer, D). */}
      <label className="flex shrink-0 items-center gap-1.5 text-[13px]">
        <span className="hidden text-muted min-[1600px]:inline">Plan wall</span>
        <select
          className="field w-[104px] py-0 text-[12px] min-[1600px]:w-[180px] min-[1600px]:text-[13px]"
          value={planBoardId ?? ""}
          onChange={(e) => ui.showBoardOnWall(e.target.value || null)}
          aria-label="Board shown on the plan wall"
        >
          <option value="">First active ({active[0]?.title ?? "none"})</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} · {b.status}
            </option>
          ))}
        </select>
      </label>

      {hasDev && (
        <div className="flex items-center gap-1.5" role="group" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <button key={s} className="btn px-2 text-[14px]" aria-pressed={speed === s} onClick={() => officeActions.setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 gap-1.5">
        <button className="btn w-6 px-0 text-[16px] leading-none" aria-label="Zoom out" onClick={() => ui.zoom(-1)}>
          −
        </button>
        <button className="btn w-6 px-0 text-[16px] leading-none" aria-label="Zoom in" onClick={() => ui.zoom(1)}>
          +
        </button>
      </div>

      <div
        className="flex shrink-0 items-center gap-2 whitespace-nowrap border-[3px] border-ink bg-navy px-2 py-0.5 text-[12px] text-cream xl:text-[13px]"
        title="Each agent runs in its own isolated Docker Sandbox (microVM)"
      >
        <span>
          Sandbox · <b>{sandboxes}</b> running{local ? ` · ${local} local` : ""}
        </span>
        <i className="led" style={runningIds.size ? undefined : { background: "#83769c", animation: "none" }} />
      </div>

      {live && stopped.length > 0 && (
        <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" onClick={() => stopped.forEach((a) => officeActions.startAgent(a.agentId))}>
          Start {stopped.length === snap.agents.length ? "team" : `${stopped.length} stopped`}
        </button>
      )}
      {live && (
        <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" onClick={() => ui.openSetup()} title="Setup checklist">
          Setup{setupIssues ? ` · ${setupIssues}` : " ✓"}
        </button>
      )}
      <div className="flex shrink-0 gap-1.5">
        <button
          className="btn shrink-0 px-2 text-[12px] xl:text-[13px]"
          style={attention ? { background: "#ffec27" } : undefined}
          onClick={() => ui.openActions()}
          title="Everything waiting on you"
        >
          Action items{attention ? ` · ${attention}` : ""}
        </button>
        <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" onClick={() => ui.openBoards(planBoardId ?? undefined)}>
          Boards
        </button>
        <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" onClick={() => ui.openPrs()}>
          PRs{openPrs ? ` · ${openPrs}` : ""}
        </button>
        <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" onClick={() => ui.openTerminal()} title="Your own shell on this machine: the repo, an agent's folder or any folder">
          Terminal
        </button>
      </div>
      <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" onClick={() => ui.openSettings("team")}>
        Settings
      </button>
      <button className="btn shrink-0 px-2 text-[12px] xl:text-[13px]" aria-pressed={debugOpen} onClick={() => ui.toggleDebug()} title="Debug panel (D)">
        Debug
      </button>
    </header>
  );
}
