"use client";
// Contract stub (harness). WP-02 implements per SPEC §4.6 (renders null until then).
// Contract return type is ReactElement; the stub widens it to `| null` only so it can render nothing.
import type { ReactElement, ReactNode } from "react";
import type { DetectorKind, MaskTarget, PrivacyState } from "@/core/types";
import type { MeasureFn } from "./scanner";
import type { PrivacyController } from "./usePrivacySpotlight";
import "./privacy-spotlight.css";

export type PrivacySpotlightProps = {
  children: ReactNode;
  /** Controlled mode (demo toolbar). Absent → internal controller from `initial`. */
  controller?: PrivacyController;
  initial?: Partial<PrivacyState>;
  detectors?: readonly DetectorKind[];
  measure?: MeasureFn;
  padding?: number;
  /** Called after every scan with the current targets ([] when not presenting). */
  onTargetsChange?: (targets: MaskTarget[]) => void;
  className?: string;
};

export function PrivacySpotlight(_props: PrivacySpotlightProps): ReactElement | null {
  return null;
}
