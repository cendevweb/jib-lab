// Contract stub (harness). WP-02 implements per SPEC §4.6.
import type { DetectorKind, MaskTarget, Point, Rect } from "@/core/types";

/** Client rects of a Range or Element in viewport px. Injectable because jsdom has no layout. */
export type MeasureFn = (target: Range | Element) => Rect[];

/** Array.from(target.getClientRects(), r => ({ x: r.left, y: r.top, width: r.width, height: r.height })) */
export const defaultMeasure: MeasureFn = (_target) => {
  throw new Error("not implemented: defaultMeasure");
};

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

export function scanSensitive(_root: Element, _options?: ScanOptions): MaskTarget[] {
  throw new Error("not implemented: scanSensitive");
}
