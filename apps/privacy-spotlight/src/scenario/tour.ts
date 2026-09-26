// Scripted 15 s tour (SPEC §4.8 / §7). Pure and deterministic: every frame is a function of the
// virtual time `t` of the @jib/demo-kit timeline, so `?tour=1&t=…` reproduces any frame.
import { type Beat, createTimeline, type Timeline } from "@jib/demo-kit";
import { DEMO_DURATION_MS } from "@/core/constants";
import type { MaskStyle } from "@/core/types";

export type TourFrame = {
  presenting: boolean;
  maskStyle: MaskStyle;
  holding: boolean;
  ticket: boolean;
};
/** target = data-testid */
export type CursorWaypoint = { at: number; target: string };

export const GLIDE_MS = 700;
export const TOUR_INITIAL: TourFrame = {
  presenting: false,
  maskStyle: "solid",
  holding: false,
  ticket: false,
};

const keep = (s: TourFrame): TourFrame => s;
const patch =
  (p: Partial<TourFrame>) =>
  (s: TourFrame): TourFrame => ({ ...s, ...p });

/** §7, label = caption. */
export const TOUR_BEATS: Beat<TourFrame>[] = [
  { at: 0, label: "A normal admin dashboard, full of customer data", apply: keep },
  {
    at: 2000,
    label: "Presentation mode: every sensitive value masked",
    apply: patch({ presenting: true }),
  },
  { at: 3000, label: "Spotlight: only what's under the cursor is readable", apply: keep },
  { at: 7000, label: "Blur mode (cosmetic)", apply: patch({ maskStyle: "blur" }) },
  { at: 8500, label: "Partial mode: •••• 4242", apply: patch({ maskStyle: "partial" }) },
  { at: 10000, label: "A new ticket arrives, already masked", apply: patch({ ticket: true }) },
  {
    at: 11500,
    label: "Hold ⌥ Alt: reveal everything, on purpose",
    apply: patch({ holding: true }),
  },
  { at: 13000, label: "Release: masked again", apply: patch({ holding: false }) },
  { at: 14000, label: "Presentation mode off", apply: patch({ presenting: false }) },
];

/** §7. */
export const TOUR_CURSOR: CursorWaypoint[] = [
  { at: 0, target: "kpi-mrr" },
  { at: 1000, target: "toggle-presenting" },
  { at: 3000, target: "customer-email-1" },
  { at: 5000, target: "api-key-live" },
  { at: 8500, target: "hidden-count" },
  { at: 13200, target: "toggle-presenting" },
];

export function createTour(): Timeline<TourFrame> {
  return createTimeline({
    initial: () => TOUR_INITIAL,
    beats: TOUR_BEATS,
    duration: DEMO_DURATION_MS,
  });
}

/** Quad ease in-out, p clamped to [0, 1]. */
export function easeInOut(p: number): number {
  const x = Math.min(1, Math.max(0, Number.isNaN(p) ? 0 : p));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/**
 * Which element the ghost cursor glides from/to at `t`. `i` = last waypoint with `at <= t`
 * (t below the first → 0). The glide lasts GLIDE_MS from `wp[i].at`, then the cursor rests.
 */
export function cursorAt(
  t: number,
  waypoints: readonly CursorWaypoint[] = TOUR_CURSOR,
): { from: string | null; to: string; progress: number } {
  const firstWp = waypoints[0];
  if (!firstWp) throw new RangeError("cursorAt: no waypoints");
  let i = 0;
  for (let k = 0; k < waypoints.length; k++) {
    const wp = waypoints[k];
    if (wp && wp.at <= t) i = k;
  }
  const current = waypoints[i] ?? firstWp;
  if (i === 0) return { from: null, to: current.target, progress: 1 };
  const previous = waypoints[i - 1] ?? firstWp;
  return {
    from: previous.target,
    to: current.target,
    progress: easeInOut((t - current.at) / GLIDE_MS),
  };
}
