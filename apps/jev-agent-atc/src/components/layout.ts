/**
 * Canvas geometry (SPEC §4.5, §6). Pure: every position is a function of (frame, t), so a
 * `?t=` URL always renders the same picture. All numbers are logical canvas pixels (960×600).
 */
import type { AgentId, RoutingEdge, Task, TaskId, TowerFrame, Zone } from "@/domain/types";

export const CANVAS: { width: 960; height: 600 } = { width: 960, height: 600 };
export const HOLD_PERIOD_MS = 4000;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Task card ("aircraft") size. */
export const CARD = { w: 148, h: 60 } as const;

export const APPROACH_RECT: Rect = { x: 16, y: 16, w: 168, h: 452 };
export const HUMAN_RECT: Rect = { x: 16, y: 484, w: 168, h: 100 };
export const RUNWAY_RECT: Rect = { x: 200, y: 484, w: 744, h: 100 };
export const CAPTION_RECT: Rect = { x: 200, y: 392, w: 744, h: 80 };

export const GATE_RECTS: Record<AgentId, Rect> = {
  frontend: { x: 200, y: 16, w: 180, h: 108 },
  backend: { x: 388, y: 16, w: 180, h: 108 },
  tests: { x: 576, y: 16, w: 180, h: 108 },
  research: { x: 764, y: 16, w: 180, h: 108 },
  review: { x: 764, y: 222, w: 180, h: 110 },
};

/** Jev tower (radar) in the middle of the field. */
export const TOWER = { cx: 300, cy: 282, r: 76 } as const;
/** Elliptical holding pattern next to the review gate. */
export const HOLDING = { cx: 572, cy: 286, rx: 98, ry: 52 } as const;

/** Header height inside every zone box. */
const ZONE_HEADER = 32;
const APPROACH_STEP = 68;
const RUNWAY_STEP = 147;

function gateOf(zone: Zone): AgentId | null {
  return zone.startsWith("gate:") ? (zone.slice(5) as AgentId) : null;
}

/** Where routing edges attach to a zone ("doors"). */
export function zoneAnchor(zone: Zone): Point {
  const gate = gateOf(zone);
  if (gate === "review") {
    const r = GATE_RECTS.review;
    return { x: r.x, y: r.y + r.h / 2 };
  }
  if (gate) {
    const r = GATE_RECTS[gate];
    return { x: r.x + r.w / 2, y: r.y + r.h };
  }
  switch (zone) {
    case "approach":
      return { x: APPROACH_RECT.x + APPROACH_RECT.w, y: APPROACH_RECT.y + APPROACH_RECT.h / 2 };
    case "holding":
      return { x: HOLDING.cx, y: HOLDING.cy - HOLDING.ry };
    case "landed":
      return { x: RUNWAY_RECT.x + RUNWAY_RECT.w / 2, y: RUNWAY_RECT.y };
    default:
      return { x: HUMAN_RECT.x + HUMAN_RECT.w / 2, y: HUMAN_RECT.y };
  }
}

function isActiveAtGate(task: Task): boolean {
  return task.status === "running" || (task.status === "review" && task.agent === "review");
}

/** Index of the task among the tasks sharing its zone (zone-specific, deterministic order). */
function slotOf(frame: TowerFrame, task: Task): { index: number; count: number } {
  const order = new Map(frame.state.tasks.map((t, i) => [t.id, i]));
  const same = frame.state.tasks.filter((t) => t.zone === task.zone);
  const rank = (t: Task) => order.get(t.id) ?? 0;
  if (task.zone === "landed") {
    same.sort((a, b) => a.since - b.since || rank(a) - rank(b));
  } else if (gateOf(task.zone)) {
    same.sort((a, b) => Number(isActiveAtGate(b)) - Number(isActiveAtGate(a)) || rank(a) - rank(b));
  }
  return { index: Math.max(0, same.indexOf(task)), count: same.length };
}

/** Top-left of the task card in canvas pixels. Pure in (frame, t). */
export function cardPosition(frame: TowerFrame, taskId: TaskId, t: number): Point {
  const task = frame.state.tasks.find((x) => x.id === taskId);
  if (!task) return { x: APPROACH_RECT.x + 10, y: APPROACH_RECT.y + ZONE_HEADER };
  const { index, count } = slotOf(frame, task);
  const gate = gateOf(task.zone);
  if (gate) {
    const r = GATE_RECTS[gate];
    return {
      x: r.x + (r.w - CARD.w) / 2 + index * 10,
      y: r.y + ZONE_HEADER + 2 + index * 8,
    };
  }
  switch (task.zone) {
    case "approach":
      return {
        x: APPROACH_RECT.x + (APPROACH_RECT.w - CARD.w) / 2,
        y: APPROACH_RECT.y + ZONE_HEADER + 2 + index * APPROACH_STEP,
      };
    case "holding": {
      const n = Math.max(1, count);
      const angle = (2 * Math.PI * t) / HOLD_PERIOD_MS + (index * 2 * Math.PI) / n;
      return {
        x: HOLDING.cx + HOLDING.rx * Math.cos(angle) - CARD.w / 2,
        y: HOLDING.cy + HOLDING.ry * Math.sin(angle) - CARD.h / 2,
      };
    }
    case "landed":
      return {
        x: RUNWAY_RECT.x + 6 + Math.min(index, 4) * RUNWAY_STEP,
        y: RUNWAY_RECT.y + ZONE_HEADER,
      };
    default:
      return {
        x: HUMAN_RECT.x + (HUMAN_RECT.w - CARD.w) / 2 + index * 6,
        y: HUMAN_RECT.y + ZONE_HEADER + index * 4,
      };
  }
}

export function cardCenter(frame: TowerFrame, taskId: TaskId, t: number): Point {
  const p = cardPosition(frame, taskId, t);
  return { x: p.x + CARD.w / 2, y: p.y + CARD.h / 2 };
}

const FIELD_CENTER: Point = { x: 560, y: 330 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Quadratic curve from a to b bending by `bend` px toward the middle of the field. */
export function curve(a: Point, b: Point, bend: number): { d: string; mid: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((FIELD_CENTER.x - mx) * nx + (FIELD_CENTER.y - my) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const c = { x: mx + nx * bend, y: my + ny * bend };
  const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
  const d = `M ${round1(a.x)} ${round1(a.y)} Q ${round1(c.x)} ${round1(c.y)} ${round1(b.x)} ${round1(b.y)}`;
  return { d, mid: { x: round1(mid.x), y: round1(mid.y) } };
}

export type EdgeGeometry = {
  /** SVG path, or null when from = to (badge sits on the card). */
  d: string | null;
  /** Where the label badge is centered. */
  label: Point;
};

/** Geometry of a routing edge: a curve between zone doors, label at the midpoint. */
export function edgeGeometry(frame: TowerFrame, edge: RoutingEdge, t: number): EdgeGeometry {
  if (edge.from === edge.to) {
    const p = cardPosition(frame, edge.taskId, t);
    return { d: null, label: { x: round1(p.x + CARD.w / 2), y: round1(p.y + CARD.h + 2) } };
  }
  const a = zoneAnchor(edge.from);
  let b = zoneAnchor(edge.to);
  const task = frame.state.tasks.find((x) => x.id === edge.taskId);
  if (task && task.zone === edge.to && (edge.to === "landed" || edge.to === "human")) {
    // Land on the aircraft itself (runway / pad slots are spread out).
    const p = cardPosition(frame, edge.taskId, t);
    b = { x: p.x + CARD.w / 2, y: p.y };
  }
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const bend = edge.retry ? 60 + len * 0.3 : Math.max(24, Math.min(80, len * 0.2));
  const c = curve(a, b, bend);
  return { d: c.d, label: c.mid };
}

/** Ghost of the forward leg of a retry loop (edge.to → edge.from), bent less than the edge. */
export function retryLoopGeometry(edge: RoutingEdge): { d: string; mid: Point } {
  const a = zoneAnchor(edge.to);
  const b = zoneAnchor(edge.from);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return curve(a, b, Math.max(20, len * 0.08));
}

/** Dependency lane from the dependent card to the prerequisite card. */
export function laneGeometry(frame: TowerFrame, task: TaskId, on: TaskId, t: number): string {
  const a = cardCenter(frame, task, t);
  const b = cardCenter(frame, on, t);
  // Long lanes bow out below the gate row instead of cutting through the cards.
  return curve(a, b, Math.max(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.28)).d;
}
