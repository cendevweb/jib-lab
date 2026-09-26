import { describe, expect, it } from "vitest";
import { spotlightMaskImage } from "@/core/geometry";
import { computeOverlay } from "@/core/overlay";
import { createPrivacyState } from "@/core/state";
import type { MaskTarget, Rect } from "@/core/types";

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

const TARGETS: MaskTarget[] = [
  {
    id: "t0",
    kind: "email",
    owner: "customer-email-0",
    rects: [r(10, 10, 100, 20)],
    partialRects: [r(10, 10, 70, 20)],
  },
  {
    id: "t1",
    kind: "marked",
    owner: null,
    rects: [r(10, 100, 100, 20), r(10, 122, 60, 20)],
    partialRects: [r(10, 100, 100, 20), r(10, 122, 60, 20)],
  },
];

describe("computeOverlay", () => {
  it("[AC-07] not presenting → no masks, count 0, reveal none", () => {
    const state = createPrivacyState({ presenting: false, holding: true, pointer: { x: 1, y: 1 } });
    expect(computeOverlay(state, TARGETS)).toEqual({
      presenting: false,
      mode: "solid",
      reveal: "none",
      spotlight: null,
      count: 0,
      masks: [],
    });
    const blur = createPrivacyState({ presenting: false, maskStyle: "blur" });
    expect(computeOverlay(blur, TARGETS).mode).toBe("blur");
  });

  it("[AC-07] presenting → one mask per rect in target/rect order", () => {
    const view = computeOverlay(createPrivacyState({ presenting: true }), TARGETS);
    expect(view.presenting).toBe(true);
    expect(view.mode).toBe("solid");
    expect(view.reveal).toBe("none");
    expect(view.spotlight).toBeNull();
    expect(view.count).toBe(2);
    expect(view.masks).toEqual([
      {
        key: "t0:0",
        targetId: "t0",
        kind: "email",
        owner: "customer-email-0",
        rect: r(10, 10, 100, 20),
        revealed: false,
        maskImage: null,
      },
      {
        key: "t1:0",
        targetId: "t1",
        kind: "marked",
        owner: null,
        rect: r(10, 100, 100, 20),
        revealed: false,
        maskImage: null,
      },
      {
        key: "t1:1",
        targetId: "t1",
        kind: "marked",
        owner: null,
        rect: r(10, 122, 60, 20),
        revealed: false,
        maskImage: null,
      },
    ]);
    expect(computeOverlay(createPrivacyState({ presenting: true }), []).count).toBe(0);
  });

  it("[AC-07] partial mode uses partialRects", () => {
    const view = computeOverlay(
      createPrivacyState({ presenting: true, maskStyle: "partial" }),
      TARGETS,
    );
    expect(view.mode).toBe("partial");
    expect(view.masks.map((m) => m.rect)).toEqual([
      r(10, 10, 70, 20),
      r(10, 100, 100, 20),
      r(10, 122, 60, 20),
    ]);
    const blur = computeOverlay(
      createPrivacyState({ presenting: true, maskStyle: "blur" }),
      TARGETS,
    );
    expect(blur.mode).toBe("blur");
    expect(blur.masks[0]?.rect).toEqual(r(10, 10, 100, 20));
  });

  it("[AC-07] holding reveals every mask without a spotlight", () => {
    const view = computeOverlay(
      createPrivacyState({ presenting: true, holding: true, pointer: { x: 60, y: 20 } }),
      TARGETS,
    );
    expect(view.reveal).toBe("all");
    expect(view.spotlight).toBeNull();
    expect(view.count).toBe(2);
    expect(view.masks).toHaveLength(3);
    for (const m of view.masks) {
      expect(m.revealed).toBe(true);
      expect(m.maskImage).toBeNull();
    }
  });

  it("[AC-07] spotlight with a pointer reveals only intersecting masks", () => {
    const state = createPrivacyState({ presenting: true, radius: 40, pointer: { x: 60, y: 20 } });
    const view = computeOverlay(state, TARGETS);
    const spot = { x: 60, y: 20, radius: 40 };
    expect(view.reveal).toBe("spotlight");
    expect(view.spotlight).toEqual(spot);
    expect(view.masks.map((m) => m.revealed)).toEqual([true, false, false]);
    expect(view.masks[0]?.maskImage).toBe(spotlightMaskImage(spot, r(10, 10, 100, 20)));
    expect(view.masks[0]?.maskImage).toContain("radial-gradient");
    expect(view.masks[1]?.maskImage).toBeNull();
    expect(view.masks[2]?.maskImage).toBeNull();
  });

  it("[AC-07] spotlight honours the feather argument and partial rects", () => {
    const state = createPrivacyState({
      presenting: true,
      maskStyle: "partial",
      radius: 40,
      pointer: { x: 60, y: 20 },
    });
    const view = computeOverlay(state, TARGETS, 0);
    const spot = { x: 60, y: 20, radius: 40 };
    expect(view.masks[0]?.rect).toEqual(r(10, 10, 70, 20));
    expect(view.masks[0]?.maskImage).toBe(spotlightMaskImage(spot, r(10, 10, 70, 20), 0));
  });

  it("[AC-07] spotlight disabled or pointer null → reveal none", () => {
    for (const state of [
      createPrivacyState({ presenting: true, spotlight: false, pointer: { x: 60, y: 20 } }),
      createPrivacyState({ presenting: true, spotlight: true, pointer: null }),
    ]) {
      const view = computeOverlay(state, TARGETS);
      expect(view.reveal).toBe("none");
      expect(view.spotlight).toBeNull();
      expect(view.masks.every((m) => !m.revealed && m.maskImage === null)).toBe(true);
    }
  });
});
