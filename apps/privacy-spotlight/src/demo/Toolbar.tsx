"use client";
// Contract stub (harness). WP-03 implements per SPEC §4.7 (renders null until then).
// Contract return type is ReactElement; the stub widens it to `| null` only so it can render nothing.
import type { ReactElement } from "react";
import type { PrivacyAction, PrivacyState } from "@/core/types";

export type ToolbarProps = {
  state: PrivacyState;
  dispatch: (a: PrivacyAction) => void;
  hiddenCount: number;
};

export function Toolbar(_props: ToolbarProps): ReactElement | null {
  return null;
}
