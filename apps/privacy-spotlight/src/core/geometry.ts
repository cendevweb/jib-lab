// Contract stub (harness). WP-01 implements per SPEC §4.3.
import type { Point, Rect, Spotlight } from "./types";

/** Drop non-finite rects and rects with width <= 0 or height <= 0. */
export function normalizeRects(_rects: readonly Rect[]): Rect[] {
  throw new Error("not implemented: normalizeRects");
}

/** x - origin.x, y - origin.y */
export function toLocal(_rect: Rect, _origin: Point): Rect {
  throw new Error("not implemented: toLocal");
}

/** Grow by pad on every side. */
export function padRect(_rect: Rect, _pad: number): Rect {
  throw new Error("not implemented: padRect");
}

export function unionRect(_a: Rect, _b: Rect): Rect {
  throw new Error("not implemented: unionRect");
}

/** Tolerance defaults to MERGE_TOLERANCE. */
export function rectsTouch(_a: Rect, _b: Rect, _tolerance?: number): boolean {
  throw new Error("not implemented: rectsTouch");
}

/** Normalize, then union touching rects until fixpoint; output sorted by y, then x. */
export function mergeRects(_rects: readonly Rect[], _tolerance?: number): Rect[] {
  throw new Error("not implemented: mergeRects");
}

/** Distance from centre to the closest point of r < s.radius (strict). */
export function circleIntersectsRect(_s: Spotlight, _r: Rect): boolean {
  throw new Error("not implemented: circleIntersectsRect");
}

/** Rect-local radial-gradient hole (see SPEC §3 backdrop root); feather defaults to SPOTLIGHT_FEATHER. */
export function spotlightMaskImage(_s: Spotlight, _r: Rect, _feather?: number): string | null {
  throw new Error("not implemented: spotlightMaskImage");
}
