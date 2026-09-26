import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIVACY_STATE,
  DEFAULT_RADIUS,
  RADIUS_MAX,
  RADIUS_MIN,
  REVEAL_KEY,
} from "@/core/constants";
import { clampRadius, createPrivacyState, privacyReducer, revealMode } from "@/core/state";
import type { PrivacyAction, PrivacyState } from "@/core/types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Presenting, spotlight on, pointer inside, not holding. */
const base = (): PrivacyState => ({
  ...DEFAULT_PRIVACY_STATE,
  presenting: true,
  pointer: { x: 10, y: 20 },
});

describe("privacy state", () => {
  it("[AC-06] createPrivacyState() deep-equals DEFAULT_PRIVACY_STATE", () => {
    expect(createPrivacyState()).toEqual(DEFAULT_PRIVACY_STATE);
    expect(DEFAULT_PRIVACY_STATE).toEqual({
      presenting: true,
      maskStyle: "solid",
      spotlight: true,
      radius: 110,
      holding: false,
      pointer: null,
      revealKey: "Alt",
    });
    expect(REVEAL_KEY).toBe("Alt");
    expect(DEFAULT_RADIUS).toBe(110);
    expect([RADIUS_MIN, RADIUS_MAX]).toEqual([40, 320]);
  });

  it("[AC-06] createPrivacyState merges the initial state, clamps radius, validates maskStyle", () => {
    const s = createPrivacyState({ radius: 999, maskStyle: "x" as never });
    expect(s.radius).toBe(320);
    expect(s.maskStyle).toBe("solid");
    expect(createPrivacyState({ presenting: false, maskStyle: "blur", radius: 160 })).toEqual({
      ...DEFAULT_PRIVACY_STATE,
      presenting: false,
      maskStyle: "blur",
      radius: 160,
    });
    expect(createPrivacyState({ radius: 3 }).radius).toBe(40);
  });

  it("[AC-06] clampRadius rounds, clamps and falls back on non-finite", () => {
    expect(clampRadius(12.4)).toBe(40);
    expect(clampRadius(Number.NaN)).toBe(110);
    expect(clampRadius(Number.POSITIVE_INFINITY)).toBe(110);
    expect(clampRadius(1000)).toBe(320);
    expect(clampRadius(150.6)).toBe(151);
    expect(clampRadius(40)).toBe(40);
    expect(clampRadius(320)).toBe(320);
  });

  it("[AC-06] setPresenting / togglePresenting flip presenting and reset holding", () => {
    const s = { ...base(), holding: true };
    const off = privacyReducer(s, { type: "setPresenting", value: false });
    expect(off.presenting).toBe(false);
    expect(off.holding).toBe(false);
    const toggled = privacyReducer(s, { type: "togglePresenting" });
    expect(toggled.presenting).toBe(false);
    expect(toggled.holding).toBe(false);
    const back = privacyReducer(toggled, { type: "togglePresenting" });
    expect(back.presenting).toBe(true);
    expect(back.holding).toBe(false);
    // same presenting value but holding was true → holding reset → new object
    const same = privacyReducer(s, { type: "setPresenting", value: true });
    expect(same.presenting).toBe(true);
    expect(same.holding).toBe(false);
  });

  it("[AC-06] setMaskStyle only accepts MASK_STYLES", () => {
    const s = base();
    expect(privacyReducer(s, { type: "setMaskStyle", value: "blur" }).maskStyle).toBe("blur");
    expect(privacyReducer(s, { type: "setMaskStyle", value: "partial" }).maskStyle).toBe("partial");
    expect(privacyReducer(s, { type: "setMaskStyle", value: "neon" as never })).toBe(s);
  });

  it("[AC-06] setSpotlight and setRadius", () => {
    const s = base();
    expect(privacyReducer(s, { type: "setSpotlight", value: false }).spotlight).toBe(false);
    expect(privacyReducer(s, { type: "setRadius", value: 1000 }).radius).toBe(320);
    expect(privacyReducer(s, { type: "setRadius", value: 12 }).radius).toBe(40);
    expect(privacyReducer(s, { type: "setRadius", value: 200 }).radius).toBe(200);
    expect(privacyReducer(s, { type: "setRadius", value: Number.NaN }).radius).toBe(110);
  });

  it("[AC-06] pointerMove / pointerLeave", () => {
    const s = { ...base(), pointer: null };
    const moved = privacyReducer(s, { type: "pointerMove", point: { x: 5, y: 6 } });
    expect(moved.pointer).toEqual({ x: 5, y: 6 });
    const left = privacyReducer(moved, { type: "pointerLeave" });
    expect(left.pointer).toBeNull();
  });

  it("[AC-06] keyDown / keyUp only react to the reveal key", () => {
    const s = base();
    const down = privacyReducer(s, { type: "keyDown", key: "Alt" });
    expect(down.holding).toBe(true);
    expect(privacyReducer(down, { type: "keyUp", key: "Alt" }).holding).toBe(false);
    expect(privacyReducer(s, { type: "keyDown", key: "Shift" })).toBe(s);
    expect(privacyReducer(down, { type: "keyUp", key: "Shift" })).toBe(down);
    const custom = createPrivacyState({ presenting: true, revealKey: "Shift" });
    expect(privacyReducer(custom, { type: "keyDown", key: "Shift" }).holding).toBe(true);
    expect(privacyReducer(custom, { type: "keyDown", key: "Alt" })).toBe(custom);
  });

  it("[AC-06] release drops holding (fail closed)", () => {
    const s = { ...base(), holding: true };
    expect(privacyReducer(s, { type: "release" }).holding).toBe(false);
  });

  it("[AC-06] sync applies a validated patch; presenting in a patch does not reset holding", () => {
    const s = { ...base(), presenting: false };
    const next = privacyReducer(s, {
      type: "sync",
      patch: {
        presenting: true,
        maskStyle: "partial",
        radius: 999,
        holding: true,
        spotlight: false,
      },
    });
    expect(next).toEqual({
      ...s,
      presenting: true,
      maskStyle: "partial",
      radius: 320,
      holding: true,
      spotlight: false,
    });
    const invalid = privacyReducer(s, {
      type: "sync",
      patch: { maskStyle: "neon" as never, presenting: true },
    });
    expect(invalid.maskStyle).toBe("solid");
    expect(invalid.presenting).toBe(true);
    const held = { ...base(), holding: true, presenting: false };
    const synced = privacyReducer(held, { type: "sync", patch: { presenting: true } });
    expect(synced.presenting).toBe(true);
    expect(synced.holding).toBe(true);
    expect(privacyReducer(held, { type: "sync", patch: { holding: false } }).holding).toBe(false);
  });

  it("[AC-06] actions that change nothing return the same object", () => {
    const s = base();
    const noops: PrivacyAction[] = [
      { type: "setPresenting", value: true },
      { type: "setMaskStyle", value: "solid" },
      { type: "setMaskStyle", value: "neon" as never },
      { type: "setSpotlight", value: true },
      { type: "setRadius", value: 110 },
      { type: "setRadius", value: 110.3 },
      { type: "keyDown", key: "Shift" },
      { type: "keyUp", key: "Alt" },
      { type: "release" },
      { type: "sync", patch: {} },
      { type: "sync", patch: { presenting: true, maskStyle: "solid", radius: 110 } },
    ];
    for (const a of noops) expect(privacyReducer(s, a), JSON.stringify(a)).toBe(s);
    const out = { ...s, pointer: null };
    expect(privacyReducer(out, { type: "pointerLeave" })).toBe(out);
    const off = { ...s, presenting: false };
    expect(privacyReducer(off, { type: "setPresenting", value: false })).toBe(off);
  });

  it("[AC-06] never mutates the input state", () => {
    const actions: PrivacyAction[] = [
      { type: "setPresenting", value: false },
      { type: "togglePresenting" },
      { type: "setMaskStyle", value: "blur" },
      { type: "setSpotlight", value: false },
      { type: "setRadius", value: 250 },
      { type: "pointerMove", point: { x: 1, y: 2 } },
      { type: "pointerLeave" },
      { type: "keyDown", key: "Alt" },
      { type: "keyUp", key: "Alt" },
      { type: "release" },
      { type: "sync", patch: { presenting: false, maskStyle: "partial", holding: true } },
    ];
    for (const a of actions) {
      const s = deepFreeze({ ...base(), holding: true, pointer: { x: 10, y: 20 } });
      const copy = structuredClone(s);
      expect(() => privacyReducer(s, a)).not.toThrow();
      expect(s).toEqual(copy);
    }
  });

  it("[AC-06] revealMode: none when not presenting, holding beats spotlight", () => {
    const s = base();
    expect(revealMode(s)).toBe("spotlight");
    expect(revealMode({ ...s, holding: true })).toBe("all");
    expect(revealMode({ ...s, holding: true, spotlight: false })).toBe("all");
    expect(revealMode({ ...s, presenting: false, holding: true })).toBe("none");
    expect(revealMode({ ...s, presenting: false })).toBe("none");
    expect(revealMode({ ...s, spotlight: false })).toBe("none");
    expect(revealMode({ ...s, pointer: null })).toBe("none");
  });
});
