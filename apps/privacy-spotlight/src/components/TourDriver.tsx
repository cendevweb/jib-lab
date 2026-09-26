"use client";
// Contract stub (harness). WP-04 implements per SPEC §4.9; mounted only when params.tour.
// Contract return type is ReactElement; the stub widens it to `| null` only so it can render nothing.
import type { ReactElement } from "react";
import type { PrivacyController } from "@/spotlight";

export function TourDriver(_props: {
  controller: PrivacyController;
  onTicket: (ticket: boolean) => void;
  initialT: number;
  autoplay: boolean;
}): ReactElement | null {
  return null;
}
