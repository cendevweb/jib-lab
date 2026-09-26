// Contract stub (harness). WP-03 implements per SPEC §4.7 (renders null until then).
// Contract return type is ReactElement; the stub widens it to `| null` only so it can render nothing.
import type { ReactElement } from "react";

export function Dashboard(_props: {
  ticket: boolean;
  onAddTicket: () => void;
}): ReactElement | null {
  return null;
}
