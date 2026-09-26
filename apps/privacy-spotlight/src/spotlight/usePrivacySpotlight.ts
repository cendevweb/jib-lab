// Controller hook (SPEC §4.6): useReducer(privacyReducer, initial, createPrivacyState)
import { useMemo, useReducer } from "react";
import { createPrivacyState, privacyReducer } from "@/core/state";
import type { PrivacyAction, PrivacyState } from "@/core/types";

export type PrivacyController = { state: PrivacyState; dispatch: (action: PrivacyAction) => void };

export function usePrivacySpotlight(initial?: Partial<PrivacyState>): PrivacyController {
  const [state, dispatch] = useReducer(privacyReducer, initial, createPrivacyState);
  return useMemo(() => ({ state, dispatch }), [state]);
}
