import {
  DEFAULT_PRIVACY_STATE,
  DEFAULT_RADIUS,
  MASK_STYLES,
  RADIUS_MAX,
  RADIUS_MIN,
} from "./constants";
import type { MaskStyle, PrivacyAction, PrivacyPatch, PrivacyState, RevealMode } from "./types";

/** Round, clamp [RADIUS_MIN, RADIUS_MAX]; non-finite → DEFAULT_RADIUS. */
export function clampRadius(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RADIUS;
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(value)));
}

function isMaskStyle(value: unknown): value is MaskStyle {
  return (MASK_STYLES as readonly unknown[]).includes(value);
}

/** DEFAULT_PRIVACY_STATE ⊕ initial; radius clamped; invalid maskStyle → "solid". */
export function createPrivacyState(initial: Partial<PrivacyState> = {}): PrivacyState {
  const merged: PrivacyState = { ...DEFAULT_PRIVACY_STATE, ...initial };
  return {
    ...merged,
    radius: clampRadius(merged.radius),
    maskStyle: isMaskStyle(merged.maskStyle) ? merged.maskStyle : "solid",
  };
}

/** Returns `state` itself when no field of `changes` differs (lets React bail out). */
function apply(state: PrivacyState, changes: Partial<PrivacyState>): PrivacyState {
  for (const key of Object.keys(changes) as (keyof PrivacyState)[]) {
    if (!Object.is(state[key], changes[key])) return { ...state, ...changes };
  }
  return state;
}

function validatePatch(patch: PrivacyPatch): Partial<PrivacyState> {
  const out: Partial<PrivacyState> = {};
  if (typeof patch.presenting === "boolean") out.presenting = patch.presenting;
  if (isMaskStyle(patch.maskStyle)) out.maskStyle = patch.maskStyle;
  if (typeof patch.spotlight === "boolean") out.spotlight = patch.spotlight;
  if (typeof patch.radius === "number") out.radius = clampRadius(patch.radius);
  if (typeof patch.holding === "boolean") out.holding = patch.holding;
  return out;
}

export function privacyReducer(state: PrivacyState, action: PrivacyAction): PrivacyState {
  switch (action.type) {
    case "setPresenting":
      return apply(state, { presenting: action.value, holding: false });
    case "togglePresenting":
      return apply(state, { presenting: !state.presenting, holding: false });
    case "setMaskStyle":
      return isMaskStyle(action.value) ? apply(state, { maskStyle: action.value }) : state;
    case "setSpotlight":
      return apply(state, { spotlight: action.value });
    case "setRadius":
      return apply(state, { radius: clampRadius(action.value) });
    case "pointerMove": {
      const p = state.pointer;
      if (p && p.x === action.point.x && p.y === action.point.y) return state;
      return { ...state, pointer: { x: action.point.x, y: action.point.y } };
    }
    case "pointerLeave":
      return apply(state, { pointer: null });
    case "keyDown":
      return action.key === state.revealKey ? apply(state, { holding: true }) : state;
    case "keyUp":
      return action.key === state.revealKey ? apply(state, { holding: false }) : state;
    case "release":
      return apply(state, { holding: false });
    case "sync":
      return apply(state, validatePatch(action.patch));
    default:
      return state;
  }
}

export function revealMode(state: PrivacyState): RevealMode {
  if (!state.presenting) return "none";
  if (state.holding) return "all";
  if (state.spotlight && state.pointer !== null) return "spotlight";
  return "none";
}
