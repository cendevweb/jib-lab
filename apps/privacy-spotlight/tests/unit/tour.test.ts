import { describe, expect, it } from "vitest";
import { DEMO_DURATION_MS } from "@/core/constants";
import {
  createTour,
  cursorAt,
  easeInOut,
  GLIDE_MS,
  TOUR_BEATS,
  TOUR_CURSOR,
  TOUR_INITIAL,
} from "@/scenario/tour";

const LABELS: [number, string][] = [
  [0, "A normal admin dashboard, full of customer data"],
  [2000, "Presentation mode: every sensitive value masked"],
  [3000, "Spotlight: only what's under the cursor is readable"],
  [7000, "Blur mode (cosmetic)"],
  [8500, "Partial mode: •••• 4242"],
  [10000, "A new ticket arrives, already masked"],
  [11500, "Hold ⌥ Alt: reveal everything, on purpose"],
  [13000, "Release: masked again"],
  [14000, "Presentation mode off"],
];

describe("tour timeline", () => {
  it("[AC-14] lasts 15 s and every beat fits inside", () => {
    const tour = createTour();
    expect(DEMO_DURATION_MS).toBe(15000);
    expect(tour.duration).toBe(15000);
    expect(tour.beats.every((b) => b.at >= 0 && b.at <= 15000)).toBe(true);
    expect(TOUR_BEATS.map((b) => [b.at, b.label])).toEqual(LABELS);
  });

  it("[AC-14] initial frame and state at each beat", () => {
    const tour = createTour();
    expect(TOUR_INITIAL).toEqual({
      presenting: false,
      maskStyle: "solid",
      holding: false,
      ticket: false,
    });
    expect(tour.stateAt(0)).toEqual(TOUR_INITIAL);
    expect(tour.stateAt(1999).presenting).toBe(false);
    expect(tour.stateAt(2000).presenting).toBe(true);
    expect(tour.stateAt(6999).maskStyle).toBe("solid");
    expect(tour.stateAt(7000).maskStyle).toBe("blur");
    expect(tour.stateAt(8500).maskStyle).toBe("partial");
    expect(tour.stateAt(9999).ticket).toBe(false);
    expect(tour.stateAt(10000).ticket).toBe(true);
    expect(tour.stateAt(11499).holding).toBe(false);
    expect(tour.stateAt(11500).holding).toBe(true);
    expect(tour.stateAt(13000).holding).toBe(false);
    expect(tour.stateAt(13999).presenting).toBe(true);
    expect(tour.stateAt(14000).presenting).toBe(false);
    expect(tour.stateAt(12000)).toEqual({
      presenting: true,
      maskStyle: "partial",
      holding: true,
      ticket: true,
    });
    // replaying is pure and deterministic
    expect(createTour().stateAt(10500)).toEqual(tour.stateAt(10500));
    expect(tour.stateAt(0)).toEqual(TOUR_INITIAL);
  });

  it("[AC-14] captions follow the beats", () => {
    const tour = createTour();
    expect(tour.captionAt(4500)).toBe("Spotlight: only what's under the cursor is readable");
    expect(tour.captionAt(0)).toBe("A normal admin dashboard, full of customer data");
    expect(tour.captionAt(12000)).toBe("Hold ⌥ Alt: reveal everything, on purpose");
    expect(tour.captionAt(15000)).toBe("Presentation mode off");
  });

  it("[AC-14] easeInOut is quadratic in/out and clamps to [0, 1]", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.25)).toBeCloseTo(0.125, 10);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOut(0.75)).toBeCloseTo(0.875, 10);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it("[AC-14] cursor waypoints and glide", () => {
    expect(GLIDE_MS).toBe(700);
    expect(TOUR_CURSOR).toEqual([
      { at: 0, target: "kpi-mrr" },
      { at: 1000, target: "toggle-presenting" },
      { at: 3000, target: "customer-email-1" },
      { at: 5000, target: "api-key-live" },
      { at: 8500, target: "hidden-count" },
      { at: 13200, target: "toggle-presenting" },
    ]);
    expect(cursorAt(0)).toEqual({ from: null, to: "kpi-mrr", progress: 1 });
    expect(cursorAt(-50)).toEqual({ from: null, to: "kpi-mrr", progress: 1 });
    expect(cursorAt(999)).toEqual({ from: null, to: "kpi-mrr", progress: 1 });
    const mid = cursorAt(1350);
    expect(mid.from).toBe("kpi-mrr");
    expect(mid.to).toBe("toggle-presenting");
    expect(mid.progress).toBeCloseTo(0.5, 10);
    expect(cursorAt(1000)).toEqual({ from: "kpi-mrr", to: "toggle-presenting", progress: 0 });
    expect(cursorAt(4500)).toEqual({
      from: "toggle-presenting",
      to: "customer-email-1",
      progress: 1,
    });
    expect(cursorAt(6000)).toEqual({ from: "customer-email-1", to: "api-key-live", progress: 1 });
    expect(cursorAt(15000)).toEqual({
      from: "hidden-count",
      to: "toggle-presenting",
      progress: 1,
    });
  });

  it("[AC-14] cursorAt accepts custom waypoints", () => {
    const wps = [
      { at: 100, target: "a" },
      { at: 1000, target: "b" },
    ];
    expect(cursorAt(0, wps)).toEqual({ from: null, to: "a", progress: 1 });
    const q = cursorAt(1175, wps);
    expect(q.from).toBe("a");
    expect(q.to).toBe("b");
    expect(q.progress).toBeCloseTo(0.125, 10);
  });
});
