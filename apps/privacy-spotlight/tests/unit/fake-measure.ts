import type { Rect } from "@/core/types";
import type { MeasureFn } from "@/spotlight/scanner";

/**
 * jsdom has no layout, so tests inject a fake `measure`:
 * - Element → its `data-box="x,y,w,h"` (viewport px), or [] when absent (= hidden).
 * - Range   → the host element's `data-box="x,y"`; each UTF-16 unit is CH px wide, LINE px tall.
 *   `data-wrap` splits the range over two lines 24 px apart; `data-split` returns two touching
 *   halves on the same line (they must be merged).
 */
export const CH = 8;
export const LINE = 16;

export const r = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

export function isRange(target: Range | Element): target is Range {
  return "startContainer" in target;
}

export function createMeasure() {
  const calls: (Range | Element)[] = [];
  const measure: MeasureFn = (target) => {
    calls.push(target);
    if (isRange(target)) {
      const host = target.startContainer.parentElement;
      const box = host?.getAttribute("data-box");
      if (!host || !box) return [];
      const [x = 0, y = 0] = box.split(",").map(Number);
      const x0 = x + target.startOffset * CH;
      const w = (target.endOffset - target.startOffset) * CH;
      if (host.hasAttribute("data-wrap")) {
        const first = Math.floor(w / 2);
        return [r(x0, y, first, LINE), r(x, y + 24, w - first, LINE)];
      }
      if (host.hasAttribute("data-split")) {
        const first = Math.floor(w / 2);
        return [r(x0, y, first, LINE), r(x0 + first, y, w - first, LINE)];
      }
      return [r(x0, y, w, LINE)];
    }
    const box = target.getAttribute("data-box");
    if (!box) return [];
    const [x = 0, y = 0, w = 0, h = 0] = box.split(",").map(Number);
    return [r(x, y, w, h)];
  };
  return { measure, calls };
}
