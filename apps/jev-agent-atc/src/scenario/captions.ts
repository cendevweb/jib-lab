/**
 * Caption overlay texts (SPEC §4.4 Captions).
 * CONTRACT STUB (harness): INTRO_CAPTION is final; functions implemented by WP-04.
 */
import type { Questions, SystemOneResult } from "@jib/jev";
import type { RoutingAction, TowerEvent, TowerState } from "@/domain/types";

export const INTRO_CAPTION = "5 tasks on approach · agents do the work, Jev decides how it moves";

export function captionForAction(
  _action: RoutingAction,
  _state: TowerState,
  _answers: SystemOneResult<Questions>["answers"] | null,
): { text: string; priority: number } | null {
  throw new Error("not implemented: captionForAction");
}

export function captionForEvent(
  _event: TowerEvent,
  _state: TowerState,
): { text: string; priority: number } | null {
  throw new Error("not implemented: captionForEvent");
}

export function summaryCaption(_state: TowerState): string {
  throw new Error("not implemented: summaryCaption");
}
