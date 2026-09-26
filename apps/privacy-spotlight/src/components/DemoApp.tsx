"use client";
// Contract stub (harness). WP-04 implements per SPEC §4.9 (renders null until then).
// Contract return type is ReactElement; the stub widens it to `| null` only so it can render nothing.
import type { ReactElement } from "react";
import type { DemoParams } from "@/core/types";

export function DemoApp(_props: { params: DemoParams }): ReactElement | null {
  return null;
}
