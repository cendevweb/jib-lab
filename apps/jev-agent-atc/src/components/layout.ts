/**
 * Canvas geometry (SPEC §4.5, §6).
 * CONTRACT STUB (harness): constants are final; functions implemented by WP-03.
 */
import type { TaskId, TowerFrame, Zone } from "@/domain/types";

export const CANVAS: { width: 960; height: 600 } = { width: 960, height: 600 };
export const HOLD_PERIOD_MS = 4000;

export function zoneAnchor(_zone: Zone): { x: number; y: number } {
  throw new Error("not implemented: zoneAnchor");
}

export function cardPosition(
  _frame: TowerFrame,
  _taskId: TaskId,
  _t: number,
): { x: number; y: number } {
  throw new Error("not implemented: cardPosition");
}
