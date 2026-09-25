/**
 * Control-tower canvas (SPEC §6): gates, task "aircraft", routing edges with Jev's probability,
 * dependency lanes, holding pattern, retry loop, runway and human pad.
 * Layers: zone boxes (HTML) → lanes/edges/radar (SVG, viewBox 960×600) → cards → badges/caption.
 * Everything is a pure function of (frame, t); CSS only animates between frames.
 */
import type { CSSProperties, ReactElement } from "react";
import type { AgentId, RoutingActionType, RoutingEdge, Task, TowerFrame } from "@/domain/types";
import {
  APPROACH_RECT,
  CANVAS,
  CAPTION_RECT,
  cardPosition,
  edgeGeometry,
  GATE_RECTS,
  HOLD_PERIOD_MS,
  HOLDING,
  HUMAN_RECT,
  laneGeometry,
  type Rect,
  RUNWAY_RECT,
  retryLoopGeometry,
  TOWER,
} from "./layout";

type Tone = "info" | "ok" | "warn" | "danger" | "accent" | "muted";
type LaneState = "done" | "blocked" | "active";

const TONES: Tone[] = ["info", "ok", "warn", "danger", "accent", "muted"];
const LANE_TONE: Record<LaneState, Tone> = { done: "ok", blocked: "danger", active: "muted" };

const EDGE_TONE: Record<RoutingActionType, Tone> = {
  assign: "info",
  hold: "warn",
  pause: "danger",
  continue: "ok",
  resume: "ok",
  reroute: "accent",
  retry: "accent",
  escalate: "danger",
  review: "warn",
  land: "ok",
};

const GATE_ORDER: AgentId[] = ["frontend", "backend", "tests", "research", "review"];
const GATE_CODE: Record<AgentId, string> = {
  frontend: "G1",
  backend: "G2",
  tests: "G3",
  research: "G4",
  review: "RV",
};

/** Radar sweep period; the sweep angle is a pure function of t. */
const RADAR_PERIOD_MS = 3000;
/** Stage lengths in ticks (build = task.work; SPEC §4.2 INVESTIGATE / REVIEW). */
const INVESTIGATE_TICKS = 8;
const REVIEW_TICKS = 10;
const STAGE_SHORT: Record<Task["stage"], string> = {
  build: "build",
  investigate: "diag",
  review: "review",
};

/** Inline CSS custom properties (numbers are logical canvas px, scaled by `--u` in CSS). */
function vars(values: Record<string, number | string>): CSSProperties {
  return values as CSSProperties;
}

function rectVars(r: Rect): CSSProperties {
  return vars({ "--x": r.x, "--y": r.y, "--w": r.w, "--h": r.h });
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stageLength(task: Task): number {
  if (task.stage === "investigate") return INVESTIGATE_TICKS;
  if (task.stage === "review") return REVIEW_TICKS;
  return Math.max(1, task.work);
}

function statusText(task: Task): string {
  switch (task.status) {
    case "queued":
      return task.agent ? "cleared" : "queued";
    case "running":
      return task.stage === "investigate" ? "investigating" : "running";
    case "blocked":
      return task.agent ? "paused" : "held";
    case "review":
      return task.agent === "review" ? "reviewing" : "holding";
    case "failed":
      return "✗ failed";
    case "retrying":
      return "↻ retrying";
    case "done":
      return "✓ landed";
    default:
      return "paged human";
  }
}

function laneState(task: Task | undefined, on: Task | undefined): LaneState {
  if (on?.status === "done") return "done";
  if (task?.status === "blocked" && on && task.blockedBy.includes(on.id)) return "blocked";
  return "active";
}

function captionTone(caption: string): Tone {
  if (caption.startsWith("✗")) return "danger";
  if (caption.startsWith("✓")) return "ok";
  if (caption.startsWith("↻")) return "accent";
  if (caption.startsWith("Jev")) return "info";
  return "muted";
}

function Markers(): ReactElement {
  return (
    <defs>
      {TONES.map((tone) => (
        <marker
          key={tone}
          id={`atc-arrow-${tone}`}
          className={`atc-marker atc-tone-${tone}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      ))}
      <radialGradient id="atc-radar-glow">
        <stop offset="0%" stopColor="var(--jib-accent)" stopOpacity="0.22" />
        <stop offset="100%" stopColor="var(--jib-accent)" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Radar({ frame, t }: { frame: TowerFrame; t: number }): ReactElement {
  const angle = r2(((t % RADAR_PERIOD_MS) / RADAR_PERIOD_MS) * 360);
  const r = TOWER.r;
  const wedge = 42 * (Math.PI / 180);
  const wx = r2(r * Math.cos(-wedge));
  const wy = r2(r * Math.sin(-wedge));
  const { used, total } = frame.state.tokenBudget;
  const deciding = frame.decisionIds.length > 0;
  return (
    <g
      className="atc-radar"
      data-deciding={deciding}
      transform={`translate(${TOWER.cx} ${TOWER.cy})`}
    >
      <circle r={r + 26} fill="url(#atc-radar-glow)" stroke="none" />
      <circle className="atc-radar__ring" r={r} />
      <circle className="atc-radar__ring atc-radar__ring--inner" r={r * 0.64} />
      <circle className="atc-radar__ring atc-radar__ring--inner" r={r * 0.3} />
      <line className="atc-radar__cross" x1={-r} y1={0} x2={r} y2={0} />
      <line className="atc-radar__cross" x1={0} y1={-r} x2={0} y2={r} />
      <g transform={`rotate(${angle})`}>
        <path className="atc-radar__sweep" d={`M 0 0 L ${r} 0 A ${r} ${r} 0 0 0 ${wx} ${wy} Z`} />
        <line className="atc-radar__beam" x1={0} y1={0} x2={r} y2={0} />
      </g>
      {deciding ? <circle key={frame.tick} className="atc-radar__pulse" r={r} /> : null}
      <text className="atc-radar__title" y={-4}>
        JEV
      </text>
      <text className="atc-radar__sub" y={12}>
        System One
      </text>
      <text className="atc-radar__meta" y={r + 16}>
        {`tick ${frame.tick} · ${deciding ? `deciding ${frame.decisionIds.join(" ")}` : "listening"}`}
      </text>
      <text className="atc-radar__meta" y={r + 28}>
        {`tokens ${(used / 1000).toFixed(1)}k / ${Math.round(total / 1000)}k · failures ${frame.state.failureCount}`}
      </text>
    </g>
  );
}

function TaskCard({
  task,
  frame,
  t,
  routed,
}: {
  task: Task;
  frame: TowerFrame;
  t: number;
  routed: boolean;
}): ReactElement {
  const p = cardPosition(frame, task.id, t);
  const len = stageLength(task);
  const progress = Math.max(0, Math.min(task.progress, len));
  return (
    <div
      className="atc-card"
      data-testid={`task-${task.id}`}
      data-status={task.status}
      data-zone={task.zone}
      data-agent={task.agent ?? ""}
      data-stage={task.stage}
      data-attempt={String(task.attempt)}
      data-kind={task.kind}
      data-orbit={task.zone === "holding"}
      data-routed={routed}
      title={`${task.id} — ${task.title}`}
      style={vars({ "--x": r2(p.x), "--y": r2(p.y) })}
    >
      <div className="atc-card__row">
        <span className="atc-card__id">{task.id}</span>
        {task.attempt >= 2 ? <span className="atc-card__attempt">↻{task.attempt}</span> : null}
      </div>
      <div className="atc-card__title">{task.title}</div>
      <div className="atc-card__row">
        <span className="atc-chip">{statusText(task)}</span>
        <span className="atc-card__prog">
          {STAGE_SHORT[task.stage]} {progress}/{len}
        </span>
      </div>
      <div className="atc-card__bar">
        <span style={{ width: `${Math.round((progress / len) * 100)}%` }} />
      </div>
    </div>
  );
}

export function TowerCanvas({ frame, t }: { frame: TowerFrame; t: number }): ReactElement {
  const { state, agents } = frame;
  const tasks = state.tasks;
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const count = (pred: (x: Task) => boolean) => tasks.filter(pred).length;
  const approachCount = count((x) => x.zone === "approach");
  const holdingCount = count((x) => x.status === "review" && x.agent === null);
  const doneCount = count((x) => x.status === "done");
  const escalatedCount = count((x) => x.status === "escalated");
  const retryEdges = frame.edges.filter((e) => e.retry && byId.get(e.taskId)?.status !== "done");
  const routedNow = new Set(frame.edges.filter((e) => e.tick === frame.tick).map((e) => e.taskId));
  const geometry = new Map(frame.edges.map((e) => [e.id, edgeGeometry(frame, e, t)]));
  const fresh = (e: RoutingEdge) => frame.tick - e.tick <= 1;
  const perimeter =
    Math.PI *
    (3 * (HOLDING.rx + HOLDING.ry) -
      Math.sqrt((3 * HOLDING.rx + HOLDING.ry) * (HOLDING.rx + 3 * HOLDING.ry)));
  const orbitOffset = r2(-((t % HOLD_PERIOD_MS) / HOLD_PERIOD_MS) * perimeter);

  return (
    <section
      className="atc-tower"
      data-testid="tower"
      data-tick={frame.tick}
      aria-label="Control tower"
    >
      <div className="atc-stage">
        {/* Layer 1 — zones */}
        <div className="atc-zone atc-zone--approach" style={rectVars(APPROACH_RECT)}>
          <div className="atc-zone__head">
            <span>Approach</span>
            <b>{approachCount}</b>
          </div>
          <ul className="atc-legend" aria-label="legend">
            <li data-tone="info">assign · running</li>
            <li data-tone="warn">hold · review</li>
            <li data-tone="danger">pause · failed</li>
            <li data-tone="ok">land · continue</li>
            <li data-tone="accent">research · retry</li>
          </ul>
        </div>
        {GATE_ORDER.map((id) => {
          const agent = agents[id];
          return (
            <div
              key={id}
              className={`atc-gate${id === "review" ? " atc-gate--review" : ""}`}
              data-testid={`gate-${id}`}
              data-status={agent.status}
              data-task={agent.taskId ?? ""}
              style={rectVars(GATE_RECTS[id])}
            >
              <div className="atc-zone__head">
                <span>
                  <em>{GATE_CODE[id]}</em> {id}
                </span>
                <span className="atc-gate__state">{agent.status}</span>
              </div>
              <div className="atc-gate__stand" />
            </div>
          );
        })}
        <div
          className="atc-zone atc-runway"
          data-testid="runway"
          data-count={doneCount}
          style={rectVars(RUNWAY_RECT)}
        >
          <div className="atc-zone__head">
            <span>Runway</span>
            <b>{doneCount} landed</b>
          </div>
        </div>
        <div
          className="atc-zone atc-pad"
          data-testid="pad-human"
          data-count={escalatedCount}
          data-active={escalatedCount > 0}
          style={rectVars(HUMAN_RECT)}
        >
          <div className="atc-zone__head">
            <span>Human pad</span>
            <b>{escalatedCount} paged</b>
          </div>
        </div>

        {/* Layer 2 — radar, holding pattern, lanes, edges */}
        <svg
          className="atc-svg"
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <Markers />
          <Radar frame={frame} t={t} />
          <g
            className="atc-holding"
            data-testid="holding-pattern"
            data-count={holdingCount}
            data-active={holdingCount > 0}
          >
            <ellipse
              cx={HOLDING.cx}
              cy={HOLDING.cy}
              rx={HOLDING.rx}
              ry={HOLDING.ry}
              style={{ strokeDashoffset: orbitOffset }}
            />
            <text className="atc-holding__label" x={HOLDING.cx} y={HOLDING.cy - 2}>
              HOLDING
            </text>
            <text className="atc-holding__count" x={HOLDING.cx} y={HOLDING.cy + 14}>
              {`${holdingCount} circling`}
            </text>
          </g>
          <g className="atc-lanes">
            {state.dependencies.map((dep) => {
              const lane = laneState(byId.get(dep.task), byId.get(dep.on));
              return (
                <path
                  key={`${dep.task}-${dep.on}`}
                  className="atc-lane"
                  data-testid={`dependency-lane-${dep.task}-${dep.on}`}
                  data-state={lane}
                  data-kind={dep.kind}
                  d={laneGeometry(frame, dep.task, dep.on, t)}
                  markerEnd={`url(#atc-arrow-${LANE_TONE[lane]})`}
                />
              );
            })}
          </g>
          <g className="atc-edges">
            {frame.edges.map((e) => {
              const d = geometry.get(e.id)?.d;
              if (!d) return null;
              const tone = EDGE_TONE[e.action];
              return (
                <path
                  key={e.id}
                  className={`atc-edge atc-tone-${tone}`}
                  data-edge={e.id}
                  data-fresh={fresh(e)}
                  data-fallback={e.fallback}
                  data-retry={e.retry}
                  d={d}
                  pathLength={1}
                  markerEnd={`url(#atc-arrow-${tone})`}
                />
              );
            })}
          </g>
          {retryEdges.length > 0 ? (
            <g className="atc-retry-loop" data-testid="retry-loop">
              {retryEdges.map((e) => {
                const ghost = retryLoopGeometry(e);
                const mid = geometry.get(e.id)?.label ?? ghost.mid;
                const cx = r2((ghost.mid.x + mid.x) / 2);
                const cy = r2((ghost.mid.y + mid.y) / 2);
                const attempt = byId.get(e.taskId)?.attempt ?? 2;
                return (
                  <g key={e.id}>
                    <path className="atc-retry-loop__ghost" d={ghost.d} />
                    <g transform={`translate(${cx} ${cy})`}>
                      <circle className="atc-retry-loop__disc" r={13} />
                      <path
                        className="atc-retry-loop__icon"
                        d="M 7 -4 A 8 8 0 1 0 8 3"
                        markerEnd="url(#atc-arrow-accent)"
                      />
                      <text className="atc-retry-loop__text" x={20} y={4}>
                        {`retry loop · attempt ${attempt}`}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          ) : null}
        </svg>

        {/* Layer 3 — aircraft */}
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} frame={frame} t={t} routed={routedNow.has(task.id)} />
        ))}

        {/* Layer 4 — probability badges + caption */}
        {frame.edges.map((e) => {
          const g = geometry.get(e.id);
          const label = g?.label ?? { x: 0, y: 0 };
          return (
            <div
              key={e.id}
              className="atc-edge-label"
              data-testid="route-edge"
              data-task={e.taskId}
              data-kind={e.kind}
              data-action={e.action}
              data-from={e.from}
              data-to={e.to}
              data-retry={String(e.retry)}
              data-fallback={String(e.fallback)}
              data-p={e.p.toFixed(2)}
              data-tone={EDGE_TONE[e.action]}
              data-fresh={fresh(e)}
              data-on-card={g?.d == null}
              title={e.fallback ? "rule-based fallback" : `Jev ${e.decisionId ?? ""}`}
              style={vars({ "--x": label.x, "--y": label.y })}
            >
              {e.label}
            </div>
          );
        })}
        <div
          className="atc-caption"
          aria-live="polite"
          data-tone={captionTone(frame.caption)}
          style={rectVars(CAPTION_RECT)}
        >
          <span className="atc-caption__tag">Tower · {(frame.t / 1000).toFixed(1)}s</span>
          <p key={frame.caption} className="atc-caption__text" data-testid="tower-caption">
            {frame.caption}
          </p>
        </div>
      </div>
    </section>
  );
}
