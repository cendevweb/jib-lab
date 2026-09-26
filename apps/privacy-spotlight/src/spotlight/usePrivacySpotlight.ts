// Contract stub (harness). WP-02 implements per SPEC §4.6:
// useReducer(privacyReducer, initial, createPrivacyState)
import type { PrivacyAction, PrivacyState } from "@/core/types";

export type PrivacyController = { state: PrivacyState; dispatch: (action: PrivacyAction) => void };

export function usePrivacySpotlight(_initial?: Partial<PrivacyState>): PrivacyController {
  throw new Error("not implemented: usePrivacySpotlight");
}
