// Contract stub (harness). WP-01 implements per SPEC §4.5.
import type { MaskTarget, OverlayView, PrivacyState } from "./types";

export function computeOverlay(
  _state: PrivacyState,
  _targets: readonly MaskTarget[],
  _feather?: number,
): OverlayView {
  throw new Error("not implemented: computeOverlay");
}
