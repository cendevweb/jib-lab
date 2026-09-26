export type DetectorKind = "email" | "phone" | "token" | "account" | "card";
/** "marked" = element carrying [data-sensitive]. */
export type SensitiveKind = DetectorKind | "marked";
export type MaskStyle = "solid" | "blur" | "partial";
/** Half-open UTF-16 range [start, end) in a text node's data. */
export type TextMatch = { kind: DetectorKind; start: number; end: number };

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Spotlight = { x: number; y: number; radius: number };

/** One sensitive value found in the container. Rects are container-local, merged, padded. */
export type MaskTarget = {
  /** "t0", "t1", … in document order, assigned after empty targets are dropped. */
  id: string;
  kind: SensitiveKind;
  /** data-testid of the closest element at/above the value, below the scanned root; else null. */
  owner: string | null;
  rects: Rect[];
  /** Rects of partialRange(match) for detector matches; equal to `rects` for "marked". */
  partialRects: Rect[];
};

export type PrivacyState = {
  presenting: boolean;
  maskStyle: MaskStyle;
  /** Spotlight reveal enabled. */
  spotlight: boolean;
  /** Spotlight radius, px, integer in [RADIUS_MIN, RADIUS_MAX]. */
  radius: number;
  /** Reveal key currently held. */
  holding: boolean;
  /** Pointer in container-local px; null when outside the container. */
  pointer: Point | null;
  /** KeyboardEvent.key that reveals all while held. */
  revealKey: string;
};
export type PrivacyPatch = Partial<
  Pick<PrivacyState, "presenting" | "maskStyle" | "spotlight" | "radius" | "holding">
>;
export type PrivacyAction =
  | { type: "setPresenting"; value: boolean }
  | { type: "togglePresenting" }
  | { type: "setMaskStyle"; value: MaskStyle }
  | { type: "setSpotlight"; value: boolean }
  | { type: "setRadius"; value: number }
  | { type: "pointerMove"; point: Point }
  | { type: "pointerLeave" }
  | { type: "keyDown"; key: string }
  | { type: "keyUp"; key: string }
  /** Window blur / tab hidden: fail closed. */
  | { type: "release" }
  /** Scripted tour: apply a validated patch. */
  | { type: "sync"; patch: PrivacyPatch };

export type RevealMode = "none" | "spotlight" | "all";
export type MaskView = {
  /** `${targetId}:${rectIndex}` */
  key: string;
  targetId: string;
  kind: SensitiveKind;
  owner: string | null;
  rect: Rect;
  revealed: boolean;
  /** CSS mask-image for the spotlight hole, or null. */
  maskImage: string | null;
};
export type OverlayView = {
  presenting: boolean;
  mode: MaskStyle;
  reveal: RevealMode;
  spotlight: Spotlight | null;
  /** Number of targets masked (0 when not presenting). */
  count: number;
  masks: MaskView[];
};

export type DemoParams = {
  presenting: boolean;
  maskStyle: MaskStyle;
  spotlight: boolean;
  radius: number;
  tour: boolean;
  autoplay: boolean;
  t: number;
};
