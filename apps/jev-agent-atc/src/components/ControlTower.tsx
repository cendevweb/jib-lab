"use client";
/**
 * Client player wiring: useScenarioPlayer + TowerCanvas + spotlight + decision log (SPEC §6).
 * CONTRACT STUB (harness): renders nothing until WP-03 implements it. Contract return type is
 * ReactElement; `| null` only exists for the stub.
 */
import type { ReactElement } from "react";
import type { ScenarioRun } from "@/domain/types";

export function ControlTower(_props: {
  run: ScenarioRun;
  initialT?: number;
  autoplay?: boolean;
}): ReactElement | null {
  return null;
}
