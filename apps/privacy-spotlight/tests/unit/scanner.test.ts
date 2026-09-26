import { afterEach, describe, expect, it } from "vitest";
import type { MaskTarget } from "@/core/types";
import { scanSensitive } from "@/spotlight/scanner";
import { createMeasure, isRange, r } from "./fake-measure";

const FIXTURE = `
<div data-testid="outside">
  <section data-testid="scan-root" id="root">
    <p data-box="120,70">Mail maya.chen@example.com or call +1 (415) 555-0132.</p>
    <div data-testid="row-1">
      <span data-testid="name-1" data-sensitive="name" data-box="120,100,80,16">Tomás <b data-sensitive="" data-box="170,100,40,16">inner@example.com</b></span>
      <span data-box="220,100">tomas.ortega@example.org</span>
    </div>
    <span data-testid="hidden-email">hidden@example.com</span>
    <div data-privacy-ignore="">
      <span data-testid="ignored-email" data-box="120,130">ignored.person@example.com</span>
      <span data-testid="ignored-secret" data-sensitive="" data-box="300,130,50,16">Private</span>
    </div>
    <script data-box="120,300">window.__x = "script@example.com";</script>
    <textarea data-box="120,320">area@example.com</textarea>
    <style data-box="120,340">.a::after { content: "style@example.com"; }</style>
    <noscript data-box="120,360">noscript@example.com</noscript>
    <span data-testid="wrapped" data-box="120,160" data-wrap="">wrapped.address@example.com</span>
    <span data-testid="split" data-box="120,200" data-split="">split@example.com</span>
  </section>
</div>`;

const ORIGIN = { x: 100, y: 50 };

/** Expected output for FIXTURE with origin (100, 50) and padding 2. */
const EXPECTED: MaskTarget[] = [
  {
    id: "t0",
    kind: "email",
    owner: null,
    rects: [r(58, 18, 172, 20)],
    partialRects: [r(58, 18, 140, 20)],
  },
  {
    id: "t1",
    kind: "phone",
    owner: null,
    rects: [r(298, 18, 140, 20)],
    partialRects: [r(298, 18, 108, 20)],
  },
  {
    id: "t2",
    kind: "marked",
    owner: "name-1",
    rects: [r(18, 48, 84, 20)],
    partialRects: [r(18, 48, 84, 20)],
  },
  {
    id: "t3",
    kind: "email",
    owner: "row-1",
    rects: [r(118, 48, 196, 20)],
    partialRects: [r(118, 48, 164, 20)],
  },
  {
    id: "t4",
    kind: "marked",
    owner: "ignored-secret",
    rects: [r(198, 78, 54, 20)],
    partialRects: [r(198, 78, 54, 20)],
  },
  {
    id: "t5",
    kind: "email",
    owner: "wrapped",
    rects: [r(18, 108, 112, 20), r(18, 132, 112, 20)],
    partialRects: [r(18, 108, 96, 20), r(18, 132, 96, 20)],
  },
  {
    id: "t6",
    kind: "email",
    owner: "split",
    rects: [r(18, 148, 140, 20)],
    partialRects: [r(18, 148, 108, 20)],
  },
];

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const root = document.querySelector<HTMLElement>("#root");
  if (!root) throw new Error("fixture root missing");
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scanSensitive", () => {
  it("[AC-09] returns every target in document order with converted, merged, padded rects", () => {
    const root = mount(FIXTURE);
    const { measure } = createMeasure();
    expect(scanSensitive(root, { measure, origin: ORIGIN })).toEqual(EXPECTED);
  });

  it("[AC-09] detects email + phone inside one text node", () => {
    const root = mount(FIXTURE);
    const { measure } = createMeasure();
    const targets = scanSensitive(root, { measure, origin: ORIGIN });
    const p = targets.slice(0, 2);
    expect(p.map((t) => [t.id, t.kind, t.owner])).toEqual([
      ["t0", "email", null],
      ["t1", "phone", null],
    ]);
    expect(targets.find((t) => t.id === "t3")?.owner).toBe("row-1");
  });

  it("[AC-09] an outer [data-sensitive] element is one marked target measured as an Element", () => {
    const root = mount(FIXTURE);
    const { measure, calls } = createMeasure();
    const targets = scanSensitive(root, { measure, origin: ORIGIN });
    const outer = root.querySelector('[data-testid="name-1"]');
    const inner = outer?.querySelector("b");
    expect(calls).toContain(outer);
    expect(calls).not.toContain(inner);
    // nothing inside the marked subtree is measured as text either
    const insideMarked = calls.filter((c) => isRange(c) && outer?.contains(c.startContainer));
    expect(insideMarked).toEqual([]);
    expect(targets.filter((t) => t.owner === "name-1")).toHaveLength(1);
    expect(targets.some((t) => t.rects.some((x) => x.x === 68 && x.y === 48))).toBe(false);
  });

  it("[AC-09] [data-privacy-ignore] skips text but a [data-sensitive] inside it is still masked", () => {
    const root = mount(FIXTURE);
    const { measure, calls } = createMeasure();
    const targets = scanSensitive(root, { measure, origin: ORIGIN });
    const ignoredEmail = root.querySelector('[data-testid="ignored-email"]');
    expect(calls.some((c) => isRange(c) && ignoredEmail?.contains(c.startContainer))).toBe(false);
    expect(targets.find((t) => t.owner === "ignored-email")).toBeUndefined();
    expect(targets.find((t) => t.owner === "ignored-secret")?.kind).toBe("marked");
  });

  it("[AC-09] script, textarea, style and noscript text is skipped", () => {
    const root = mount(FIXTURE);
    const { measure, calls } = createMeasure();
    const targets = scanSensitive(root, { measure, origin: ORIGIN });
    for (const tag of ["script", "textarea", "style", "noscript"]) {
      const el = root.querySelector(tag);
      expect(el, tag).not.toBeNull();
      expect(
        calls.some((c) => isRange(c) && el?.contains(c.startContainer)),
        tag,
      ).toBe(false);
    }
    expect(targets.every((t) => t.rects.every((x) => x.y < 250))).toBe(true);
  });

  it("[AC-09] targets whose measure returns [] are dropped before ids are assigned", () => {
    const root = mount(FIXTURE);
    const { measure } = createMeasure();
    const targets = scanSensitive(root, { measure, origin: ORIGIN });
    expect(targets.find((t) => t.owner === "hidden-email")).toBeUndefined();
    expect(targets.map((t) => t.id)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5", "t6"]);
  });

  it("[AC-09] partialRects of a 21-char email come from a Range ending 4 chars early", () => {
    const root = mount(FIXTURE);
    const { measure, calls } = createMeasure();
    scanSensitive(root, { measure, origin: ORIGIN });
    const p = root.querySelector("p");
    const ranges = calls
      .filter(isRange)
      .filter((c) => c.startContainer.parentElement === p)
      .map((c) => [c.startOffset, c.endOffset]);
    expect(ranges).toContainEqual([5, 26]);
    expect(ranges).toContainEqual([5, 22]);
    expect(ranges).toContainEqual([35, 52]);
    expect(ranges).toContainEqual([35, 48]);
  });

  it("[AC-09] padding and keep options; default padding is MASK_PADDING (2)", () => {
    const root = mount(FIXTURE);
    const [t0] = scanSensitive(root, {
      measure: createMeasure().measure,
      origin: ORIGIN,
      padding: 0,
      keep: 2,
    });
    expect(t0?.rects).toEqual([r(60, 20, 168, 16)]);
    expect(t0?.partialRects).toEqual([r(60, 20, 152, 16)]);
  });

  it("[AC-09] without origin, the root's bounding client rect is the origin", () => {
    document.body.innerHTML =
      '<div id="root"><span data-testid="v" data-box="10,10">a.b@example.com</span></div>';
    const root = document.querySelector<HTMLElement>("#root");
    if (!root) throw new Error("root missing");
    // jsdom: getBoundingClientRect() is all zeros → local = viewport coordinates
    const [t] = scanSensitive(root, { measure: createMeasure().measure });
    expect(t).toEqual({
      id: "t0",
      kind: "email",
      owner: "v",
      rects: [r(8, 8, 124, 20)],
      partialRects: [r(8, 8, 92, 20)],
    });
  });

  it("[AC-09] owner never resolves to the root or its ancestors", () => {
    document.body.innerHTML =
      '<main data-testid="page"><div id="root" data-testid="root-id" data-box="0,0">maya@example.com <em data-box="200,0">leo@example.com</em></div></main>';
    const root = document.querySelector<HTMLElement>("#root");
    if (!root) throw new Error("root missing");
    const targets = scanSensitive(root, {
      measure: createMeasure().measure,
      origin: { x: 0, y: 0 },
    });
    expect(targets.map((t) => [t.kind, t.owner])).toEqual([
      ["email", null],
      ["email", null],
    ]);
  });

  it("[AC-09] detectors option limits the detectors (email only ignores phones)", () => {
    const root = mount(FIXTURE);
    const targets = scanSensitive(root, {
      measure: createMeasure().measure,
      origin: ORIGIN,
      detectors: ["email"],
    });
    expect(targets.map((t) => t.kind)).toEqual([
      "email",
      "marked",
      "email",
      "marked",
      "email",
      "email",
    ]);
    expect(targets.map((t) => t.id)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5"]);
    expect(targets.some((t) => t.kind === "phone")).toBe(false);
  });
});
