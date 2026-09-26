import { MERGE_TOLERANCE, SPOTLIGHT_FEATHER } from "./constants";
import type { Point, Rect, Spotlight } from "./types";

/** Drop non-finite rects and rects with width <= 0 or height <= 0. */
export function normalizeRects(rects: readonly Rect[]): Rect[] {
  return rects.filter(
    (r) =>
      Number.isFinite(r.x) &&
      Number.isFinite(r.y) &&
      Number.isFinite(r.width) &&
      Number.isFinite(r.height) &&
      r.width > 0 &&
      r.height > 0,
  );
}

/** x - origin.x, y - origin.y */
export function toLocal(rect: Rect, origin: Point): Rect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}

/** Grow by pad on every side. */
export function padRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + 2 * pad,
    height: rect.height + 2 * pad,
  };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/** Tolerance defaults to MERGE_TOLERANCE. */
export function rectsTouch(a: Rect, b: Rect, tolerance: number = MERGE_TOLERANCE): boolean {
  return (
    a.x <= b.x + b.width + tolerance &&
    b.x <= a.x + a.width + tolerance &&
    a.y <= b.y + b.height + tolerance &&
    b.y <= a.y + a.height + tolerance
  );
}

/** Normalize, then union touching rects until fixpoint; output sorted by y, then x. */
export function mergeRects(rects: readonly Rect[], tolerance: number = MERGE_TOLERANCE): Rect[] {
  const out: Rect[] = normalizeRects(rects).map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i] as Rect;
        const b = out[j] as Rect;
        if (rectsTouch(a, b, tolerance)) {
          out[i] = unionRect(a, b);
          out.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Distance from centre to the closest point of r < s.radius (strict). */
export function circleIntersectsRect(s: Spotlight, r: Rect): boolean {
  const cx = Math.min(Math.max(s.x, r.x), r.x + r.width);
  const cy = Math.min(Math.max(s.y, r.y), r.y + r.height);
  const dx = s.x - cx;
  const dy = s.y - cy;
  return dx * dx + dy * dy < s.radius * s.radius;
}

/** Rect-local radial-gradient hole (see SPEC §3 backdrop root); feather defaults to SPOTLIGHT_FEATHER. */
export function spotlightMaskImage(
  s: Spotlight,
  r: Rect,
  feather: number = SPOTLIGHT_FEATHER,
): string | null {
  if (!circleIntersectsRect(s, r)) return null;
  const R = Math.round(s.radius);
  const lx = Math.round(s.x - r.x);
  const ly = Math.round(s.y - r.y);
  const inner = Math.max(0, R - feather);
  return `radial-gradient(circle ${R}px at ${lx}px ${ly}px, transparent ${inner}px, black ${R}px)`;
}
