// Contract stub (harness). WP-01 implements per SPEC §4.4.
import type { PrivacyAction, PrivacyState, RevealMode } from "./types";

/** Round, clamp [RADIUS_MIN, RADIUS_MAX]; non-finite → DEFAULT_RADIUS. */
export function clampRadius(_value: number): number {
  throw new Error("not implemented: clampRadius");
}

/** DEFAULT_PRIVACY_STATE ⊕ initial; radius clamped; invalid maskStyle → "solid". */
export function createPrivacyState(_initial?: Partial<PrivacyState>): PrivacyState {
  throw new Error("not implemented: createPrivacyState");
}

export function privacyReducer(_state: PrivacyState, _action: PrivacyAction): PrivacyState {
  throw new Error("not implemented: privacyReducer");
}

export function revealMode(_state: PrivacyState): RevealMode {
  throw new Error("not implemented: revealMode");
}
