import type { DetectorKind, MaskStyle, PrivacyState, SensitiveKind } from "./types";

export const DETECTOR_KINDS: readonly DetectorKind[] = [
  "email",
  "phone",
  "token",
  "account",
  "card",
];
/** Tie-break when merged matches have equal length (earlier wins). */
export const KIND_PRIORITY: readonly DetectorKind[] = [
  "token",
  "card",
  "email",
  "account",
  "phone",
];
export const MASK_STYLES: readonly MaskStyle[] = ["solid", "blur", "partial"];
export const KIND_LABELS: Record<SensitiveKind, string> = {
  email: "EMAIL",
  phone: "PHONE",
  token: "SECRET",
  account: "ID",
  card: "CARD",
  marked: "PRIVATE",
};
export const RADIUS_MIN = 40;
export const RADIUS_MAX = 320;
export const DEFAULT_RADIUS = 110;
export const MASK_PADDING = 2;
export const MERGE_TOLERANCE = 1;
export const PARTIAL_KEEP = 4;
export const SPOTLIGHT_FEATHER = 12;
export const REVEAL_KEY = "Alt";
export const DEMO_DURATION_MS = 15_000;
/** Library default: wrapping something protects it (fail-closed). The demo starts with presenting false. */
export const DEFAULT_PRIVACY_STATE: PrivacyState = {
  presenting: true,
  maskStyle: "solid",
  spotlight: true,
  radius: DEFAULT_RADIUS,
  holding: false,
  pointer: null,
  revealKey: REVEAL_KEY,
};
