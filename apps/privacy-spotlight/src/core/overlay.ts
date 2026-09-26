import { circleIntersectsRect, spotlightMaskImage } from "./geometry";
import { revealMode } from "./state";
import type { MaskTarget, MaskView, OverlayView, PrivacyState, Spotlight } from "./types";

export function computeOverlay(
  state: PrivacyState,
  targets: readonly MaskTarget[],
  feather?: number,
): OverlayView {
  const mode = state.maskStyle;
  if (!state.presenting) {
    return { presenting: false, mode, reveal: "none", spotlight: null, count: 0, masks: [] };
  }
  const reveal = revealMode(state);
  const spotlight: Spotlight | null =
    reveal === "spotlight" && state.pointer
      ? { x: state.pointer.x, y: state.pointer.y, radius: state.radius }
      : null;
  const masks: MaskView[] = [];
  for (const target of targets) {
    const rects = mode === "partial" ? target.partialRects : target.rects;
    rects.forEach((rect, i) => {
      let revealed = reveal === "all";
      let maskImage: string | null = null;
      if (spotlight) {
        revealed = circleIntersectsRect(spotlight, rect);
        maskImage = spotlightMaskImage(spotlight, rect, feather);
      }
      masks.push({
        key: `${target.id}:${i}`,
        targetId: target.id,
        kind: target.kind,
        owner: target.owner,
        rect,
        revealed,
        maskImage,
      });
    });
  }
  return { presenting: true, mode, reveal, spotlight, count: targets.length, masks };
}
