import { describe, expect, it } from "vitest";
import { createRng, createTimeline, createVirtualClock, initialPlayback, tick } from "../src";

describe("rng", () => {
  it("is reproducible", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.int(1, 6), a.pick(["x", "y"])]).toEqual([
      b.next(),
      b.int(1, 6),
      b.pick(["x", "y"]),
    ]);
  });
  it("int stays in bounds", () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 4);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
    }
  });
});

describe("virtual clock", () => {
  it("fires timers in order, including ones scheduled while advancing", () => {
    const c = createVirtualClock();
    const out: string[] = [];
    c.setTimeout(() => {
      out.push(`a@${c.now()}`);
      c.setTimeout(() => out.push(`c@${c.now()}`), 10);
    }, 100);
    c.setTimeout(() => out.push(`b@${c.now()}`), 105);
    const id = c.setTimeout(() => out.push("never"), 50);
    c.clearTimeout(id);
    c.advance(200);
    expect(out).toEqual(["a@100", "b@105", "c@110"]);
    expect(c.now()).toBe(200);
    expect(() => c.advanceTo(10)).toThrow();
  });
});

describe("timeline", () => {
  const tl = createTimeline<number[]>({
    initial: () => [],
    beats: [
      { at: 2000, label: "two", apply: (s) => [...s, 2] },
      { at: 1000, label: "one", apply: (s) => [...s, 1] },
    ],
  });
  it("replays beats deterministically for any t", () => {
    expect(tl.duration).toBe(3000);
    expect(tl.stateAt(0)).toEqual([]);
    expect(tl.stateAt(1500)).toEqual([1]);
    expect(tl.stateAt(5000)).toEqual([1, 2]);
    expect(tl.captionAt(2100)).toBe("two");
    expect(tl.beatsBetween(1000, 2000).map((b) => b.label)).toEqual(["two"]);
  });
  it("tick advances with speed and stops at the end", () => {
    let p = { ...initialPlayback, playing: true, speed: 2 };
    p = tick(p, 1000, 3000);
    expect(p.t).toBe(2000);
    p = tick(p, 1000, 3000);
    expect(p).toMatchObject({ t: 3000, ended: true, playing: false });
    expect(tick(p, 1000, 3000)).toBe(p);
  });
});
