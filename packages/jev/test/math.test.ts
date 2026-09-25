import { describe, expect, it } from "vitest";
import { argmax, confidenceOf, expectedScore, normalize, stableStringify } from "../src/math";

describe("math", () => {
  it("normalizes weights and falls back to uniform", () => {
    expect(normalize([1, 3])).toEqual([0.25, 0.75]);
    expect(normalize([0, 0])).toEqual([0.5, 0.5]);
    expect(normalize([-1, Number.NaN, 2])).toEqual([0, 0, 1]);
  });
  it("argmax picks first max", () => {
    expect(argmax([0.2, 0.5, 0.5])).toBe(1);
  });
  it("confidence is 1 for one-hot, 0 for uniform", () => {
    expect(confidenceOf([1, 0, 0])).toBe(1);
    expect(confidenceOf([1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(0, 10);
    expect(confidenceOf([0.9, 0.1])).toBeGreaterThan(confidenceOf([0.6, 0.4]));
  });
  it("expected score", () => {
    expect(expectedScore([0, 0.5, 0.5])).toBe(1.5);
  });
  it("stable stringify ignores key order", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(
      stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }),
    );
  });
});
