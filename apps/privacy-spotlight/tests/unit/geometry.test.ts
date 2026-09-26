import { describe, expect, it } from "vitest";
import { MERGE_TOLERANCE, SPOTLIGHT_FEATHER } from "@/core/constants";
import {
  circleIntersectsRect,
  mergeRects,
  normalizeRects,
  padRect,
  rectsTouch,
  spotlightMaskImage,
  toLocal,
  unionRect,
} from "@/core/geometry";
import type { Rect } from "@/core/types";

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe("rect geometry", () => {
  it("[AC-04] normalizeRects drops zero, negative and non-finite sizes", () => {
    const ok = r(1, 2, 3, 4);
    expect(
      normalizeRects([
        ok,
        r(0, 0, 0, 5),
        r(0, 0, 5, 0),
        r(0, 0, -1, 5),
        r(0, 0, 5, -1),
        r(Number.NaN, 0, 5, 5),
        r(0, Number.POSITIVE_INFINITY, 5, 5),
        r(0, 0, Number.POSITIVE_INFINITY, 5),
        r(0, 0, 5, Number.NaN),
        r(10, 10, 0.5, 0.5),
      ]),
    ).toEqual([ok, r(10, 10, 0.5, 0.5)]);
    expect(normalizeRects([])).toEqual([]);
  });

  it("[AC-04] toLocal subtracts the origin and keeps the size", () => {
    expect(toLocal(r(110, 60, 30, 12), { x: 100, y: 50 })).toEqual(r(10, 10, 30, 12));
    expect(toLocal(r(5, 5, 1, 1), { x: 10, y: 20 })).toEqual(r(-5, -15, 1, 1));
  });

  it("[AC-04] padRect grows by pad on every side", () => {
    expect(padRect(r(10, 10, 20, 10), 2)).toEqual(r(8, 8, 24, 14));
    expect(padRect(r(10, 10, 20, 10), 0)).toEqual(r(10, 10, 20, 10));
  });

  it("[AC-04] unionRect is the bounding box of both rects", () => {
    expect(unionRect(r(0, 0, 10, 10), r(20, 5, 10, 10))).toEqual(r(0, 0, 30, 15));
    expect(unionRect(r(5, 5, 2, 2), r(0, 0, 20, 20))).toEqual(r(0, 0, 20, 20));
  });

  it("[AC-04] rectsTouch honours the tolerance (default MERGE_TOLERANCE)", () => {
    expect(MERGE_TOLERANCE).toBe(1);
    const a = r(0, 0, 10, 10);
    expect(rectsTouch(a, r(5, 5, 10, 10))).toBe(true); // overlap
    expect(rectsTouch(a, r(10, 0, 5, 5))).toBe(true); // edge contact
    expect(rectsTouch(a, r(11, 0, 5, 5))).toBe(true); // 1 px gap, default tolerance
    expect(rectsTouch(a, r(11, 0, 5, 5), 0)).toBe(false);
    expect(rectsTouch(a, r(11.5, 0, 5, 5))).toBe(false);
    expect(rectsTouch(a, r(11.5, 0, 5, 5), 2)).toBe(true);
    expect(rectsTouch(a, r(0, 11, 5, 5))).toBe(true);
    expect(rectsTouch(a, r(0, 12, 5, 5))).toBe(false);
    expect(rectsTouch(r(20, 0, 5, 5), a)).toBe(false); // symmetric, b left of a
    expect(rectsTouch(a, r(20, 20, 5, 5), 100)).toBe(true);
  });

  it("[AC-04] mergeRects normalizes then unions touching rects", () => {
    expect(
      mergeRects([r(10, 10, 20, 10), r(30.5, 10, 20, 10), r(10, 40, 5, 5), r(0, 0, 0, 5)]),
    ).toEqual([r(10, 10, 40.5, 10), r(10, 40, 5, 5)]);
    expect(mergeRects([])).toEqual([]);
    expect(mergeRects([r(0, 0, 10, 10), r(11.5, 0, 10, 10)], 2)).toEqual([r(0, 0, 21.5, 10)]);
    expect(mergeRects([r(0, 0, 10, 10), r(11.5, 0, 10, 10)])).toEqual([
      r(0, 0, 10, 10),
      r(11.5, 0, 10, 10),
    ]);
  });

  it("[AC-04] merging is transitive and runs to a fixpoint", () => {
    // A–B–C chain given out of order: A and C never touch directly.
    expect(mergeRects([r(0, 0, 10, 10), r(20, 0, 10, 10), r(10, 0, 10, 10)])).toEqual([
      r(0, 0, 30, 10),
    ]);
    // C only touches the union of A and B.
    expect(mergeRects([r(80, 15, 10, 10), r(0, 0, 100, 10), r(50, 11, 10, 10)])).toEqual([
      r(0, 0, 100, 25),
    ]);
  });

  it("[AC-04] output is sorted by y, then x, and the input is not mutated", () => {
    const input = [r(50, 50, 5, 5), r(10, 50, 5, 5), r(0, 0, 5, 5), r(30, 20, 5, 5)];
    const copy = structuredClone(input);
    for (const x of input) Object.freeze(x);
    expect(mergeRects(Object.freeze(input))).toEqual([
      r(0, 0, 5, 5),
      r(30, 20, 5, 5),
      r(10, 50, 5, 5),
      r(50, 50, 5, 5),
    ]);
    expect(input).toEqual(copy);
  });
});

describe("spotlight geometry", () => {
  it("[AC-05] circleIntersectsRect: inside, near corner, far corner, tangent", () => {
    expect(circleIntersectsRect({ x: 15, y: 15, radius: 1 }, r(10, 10, 10, 10))).toBe(true);
    expect(circleIntersectsRect({ x: 0, y: 0, radius: 10 }, r(6, 6, 10, 10))).toBe(true);
    expect(circleIntersectsRect({ x: 0, y: 0, radius: 10 }, r(8, 8, 10, 10))).toBe(false);
    // tangent: closest point (10, 0) is exactly radius away → strict comparison → false
    expect(circleIntersectsRect({ x: 0, y: 0, radius: 10 }, r(10, -5, 5, 10))).toBe(false);
    expect(circleIntersectsRect({ x: 0, y: 0, radius: 10 }, r(9.9, -5, 5, 10))).toBe(true);
    // rect entirely inside the circle
    expect(circleIntersectsRect({ x: 0, y: 0, radius: 100 }, r(-5, -5, 10, 10))).toBe(true);
  });

  it("[AC-05] spotlightMaskImage builds the rect-local radial gradient", () => {
    expect(SPOTLIGHT_FEATHER).toBe(12);
    expect(spotlightMaskImage({ x: 150, y: 120, radius: 100 }, r(100, 100, 200, 40))).toBe(
      "radial-gradient(circle 100px at 50px 20px, transparent 88px, black 100px)",
    );
  });

  it("[AC-05] the inner stop never goes below 0px", () => {
    expect(spotlightMaskImage({ x: 150, y: 120, radius: 10 }, r(100, 100, 200, 40))).toBe(
      "radial-gradient(circle 10px at 50px 20px, transparent 0px, black 10px)",
    );
  });

  it("[AC-05] radius and centre are rounded", () => {
    expect(spotlightMaskImage({ x: 150.6, y: 120.4, radius: 99.5 }, r(100, 100, 200, 40))).toBe(
      "radial-gradient(circle 100px at 51px 20px, transparent 88px, black 100px)",
    );
  });

  it("[AC-05] the centre may lie outside the rect (negative / far local coordinates)", () => {
    expect(spotlightMaskImage({ x: 90, y: 90, radius: 40 }, r(100, 100, 200, 40))).toBe(
      "radial-gradient(circle 40px at -10px -10px, transparent 28px, black 40px)",
    );
  });

  it("[AC-05] feather is configurable", () => {
    expect(spotlightMaskImage({ x: 150, y: 120, radius: 100 }, r(100, 100, 200, 40), 0)).toBe(
      "radial-gradient(circle 100px at 50px 20px, transparent 100px, black 100px)",
    );
    expect(spotlightMaskImage({ x: 150, y: 120, radius: 100 }, r(100, 100, 200, 40), 30)).toBe(
      "radial-gradient(circle 100px at 50px 20px, transparent 70px, black 100px)",
    );
  });

  it("[AC-05] a non-intersecting rect gives null", () => {
    expect(spotlightMaskImage({ x: 0, y: 0, radius: 10 }, r(8, 8, 10, 10))).toBeNull();
    expect(spotlightMaskImage({ x: 0, y: 0, radius: 10 }, r(10, -5, 5, 10))).toBeNull();
    expect(spotlightMaskImage({ x: 500, y: 500, radius: 110 }, r(0, 0, 100, 20))).toBeNull();
  });
});
