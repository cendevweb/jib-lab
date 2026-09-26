// Contract stub (harness). WP-04 implements per SPEC §4.8 and fills TOUR_BEATS / TOUR_CURSOR from §7.
import type { Beat, Timeline } from "@jib/demo-kit";
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
/** §7, label = caption. */
export const TOUR_BEATS: Beat<TourFrame>[] = [];
/** §7. */
export const TOUR_CURSOR: CursorWaypoint[] = [];

/** createTimeline({ initial: () => TOUR_INITIAL, beats: TOUR_BEATS, duration: DEMO_DURATION_MS }) */
export function createTour(): Timeline<TourFrame> {
  throw new Error("not implemented: createTour");
}

/** Quad ease in-out, p clamped to [0, 1]. */
export function easeInOut(_p: number): number {
  throw new Error("not implemented: easeInOut");
}

export function cursorAt(
  _t: number,
  _waypoints?: readonly CursorWaypoint[],
): { from: string | null; to: string; progress: number } {
  throw new Error("not implemented: cursorAt");
}
