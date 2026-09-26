// DOM scanner (SPEC §4.6): finds sensitive values under a root and measures them.
import { DETECTOR_KINDS, MASK_PADDING, PARTIAL_KEEP } from "@/core/constants";
import { detect, partialRange } from "@/core/detectors";
import { mergeRects, padRect, toLocal } from "@/core/geometry";
import type { DetectorKind, MaskTarget, Point, Rect, SensitiveKind } from "@/core/types";

/** Client rects of a Range or Element in viewport px. Injectable because jsdom has no layout. */
export type MeasureFn = (target: Range | Element) => Rect[];

/** Array.from(target.getClientRects(), r => ({ x: r.left, y: r.top, width: r.width, height: r.height })) */
export const defaultMeasure: MeasureFn = (target) =>
  Array.from(target.getClientRects(), (r) => ({
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  }));

export type ScanOptions = {
  /** Default DETECTOR_KINDS. */
  detectors?: readonly DetectorKind[];
  /** Default defaultMeasure. */
  measure?: MeasureFn;
  /** Viewport position of the overlay origin; default root.getBoundingClientRect() left/top. */
  origin?: Point;
  /** Default MASK_PADDING. */
  padding?: number;
  /** Default PARTIAL_KEEP. */
  keep?: number;
};

const SENSITIVE_ATTR = "data-sensitive";
const IGNORE_ATTR = "data-privacy-ignore";
/** Text under these elements is never scanned. */
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA"]);

// DOM node type constants (avoid relying on the global `Node` outside the browser).
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SHOW_ELEMENT = 0x1;
const SHOW_TEXT = 0x4;

type Draft = Omit<MaskTarget, "id">;

/** Closest data-testid at or above `el`, stopping before `root` (root and above are never owners). */
function ownerOf(el: Element | null, root: Element): string | null {
  for (let cur = el; cur && cur !== root; cur = cur.parentElement) {
    const id = cur.getAttribute("data-testid");
    if (id !== null && id !== "") return id;
  }
  return null;
}

/** True when a text node's ancestors (up to and including root) opt out of text scanning. */
function isTextSkipped(text: Text, root: Element): boolean {
  for (let cur = text.parentElement; cur; cur = cur.parentElement) {
    if (SKIPPED_TAGS.has(cur.tagName.toUpperCase()) || cur.hasAttribute(IGNORE_ATTR)) return true;
    if (cur === root) break;
  }
  return false;
}

/** Next node in document order after `walker.currentNode`, skipping its subtree. */
function nextSkippingChildren(walker: TreeWalker, root: Node): Node | null {
  let node: Node | null = walker.currentNode;
  while (node && node !== root) {
    const sibling = walker.nextSibling();
    if (sibling) return sibling;
    node = walker.parentNode();
  }
  return null;
}

/**
 * Walk `root` in document order and return every sensitive value with container-local,
 * merged, padded rects (SPEC §4.6 "scanSensitive").
 */
export function scanSensitive(root: Element, options: ScanOptions = {}): MaskTarget[] {
  const detectors = options.detectors ?? DETECTOR_KINDS;
  const measure = options.measure ?? defaultMeasure;
  const padding = options.padding ?? MASK_PADDING;
  const keep = options.keep ?? PARTIAL_KEEP;
  const origin: Point =
    options.origin ??
    (() => {
      const r = root.getBoundingClientRect();
      return { x: r.left, y: r.top };
    })();

  const toRects = (target: Range | Element): Rect[] =>
    mergeRects(measure(target).map((r) => toLocal(r, origin))).map((r) => padRect(r, padding));

  const drafts: Draft[] = [];
  const pushMarked = (el: Element) => {
    const rects = toRects(el);
    drafts.push({
      kind: "marked",
      owner: ownerOf(el, root),
      rects,
      partialRects: rects.map((r) => ({ ...r })),
    });
  };

  if (root.hasAttribute(SENSITIVE_ATTR)) {
    // The whole root is explicitly sensitive: one mask, nothing else to find.
    pushMarked(root);
  } else {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, SHOW_ELEMENT | SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      if (node.nodeType === ELEMENT_NODE) {
        const el = node as Element;
        if (el.hasAttribute(SENSITIVE_ATTR)) {
          pushMarked(el);
          node = nextSkippingChildren(walker, root);
          continue;
        }
      } else if (node.nodeType === TEXT_NODE) {
        const text = node as Text;
        if (!isTextSkipped(text, root)) {
          const owner = ownerOf(text.parentElement, root);
          for (const match of detect(text.data, detectors)) {
            const rects = toRects(rangeOf(doc, text, match.start, match.end));
            const part = partialRange(match, keep);
            const partialRects =
              part.start === match.start && part.end === match.end
                ? rects.map((r) => ({ ...r }))
                : toRects(rangeOf(doc, text, part.start, part.end));
            drafts.push({
              kind: match.kind as SensitiveKind,
              owner,
              rects,
              // Fail closed: if the partial range cannot be measured, mask the whole value.
              partialRects: partialRects.length > 0 ? partialRects : rects.map((r) => ({ ...r })),
            });
          }
        }
      }
      node = walker.nextNode();
    }
  }

  return drafts
    .filter((d) => d.rects.length > 0)
    .map((d, i) => ({
      id: `t${i}`,
      kind: d.kind,
      owner: d.owner,
      rects: d.rects,
      partialRects: d.partialRects,
    }));
}

function rangeOf(doc: Document, text: Text, start: number, end: number): Range {
  const range = doc.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  return range;
}
