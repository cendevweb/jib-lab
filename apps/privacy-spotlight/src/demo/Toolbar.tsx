"use client";
// Demo toolbar (SPEC §4.7). Lives outside the <PrivacySpotlight> wrapper: pure view of the
// privacy state, every control dispatches one reducer action.
import type { ReactElement } from "react";
import { MASK_STYLES, RADIUS_MAX, RADIUS_MIN } from "@/core/constants";
import type { MaskStyle, PrivacyAction, PrivacyState } from "@/core/types";
import "./demo.css";

export type ToolbarProps = {
  state: PrivacyState;
  dispatch: (a: PrivacyAction) => void;
  hiddenCount: number;
};

const MODE_LABELS: Record<MaskStyle, string> = {
  solid: "Solid",
  blur: "Blur",
  partial: "Partial",
};

const MODE_TITLES: Record<MaskStyle, string> = {
  solid: "Opaque masks: nothing leaks.",
  blur: "Cosmetic: blur can leak short values. Use Solid on real calls.",
  partial: "Keeps the last 4 characters of detected values readable.",
};

const RADIUS_STEP = 10;

function hiddenLabel(presenting: boolean, n: number): string {
  if (!presenting) return "Not presenting";
  return n === 1 ? "1 value hidden" : `${n} values hidden`;
}

export function Toolbar({ state, dispatch, hiddenCount }: ToolbarProps): ReactElement {
  const count = state.presenting ? hiddenCount : 0;
  const active = state.presenting && state.holding;
  return (
    <div className="tbar" data-testid="toolbar" data-presenting={state.presenting}>
      <button
        type="button"
        className="jib-btn tbar-present"
        data-testid="toggle-presenting"
        aria-pressed={state.presenting}
        onClick={() => dispatch({ type: "togglePresenting" })}
      >
        <span className="tbar-switch" aria-hidden="true" />
        Presentation mode
      </button>

      <fieldset className="tbar-group">
        <legend className="tbar-label">Mask</legend>
        <div className="tbar-segment">
          {MASK_STYLES.map((mode) => (
            <button
              key={mode}
              type="button"
              className="jib-btn tbar-seg"
              data-testid={`mode-${mode}`}
              aria-pressed={state.maskStyle === mode}
              title={MODE_TITLES[mode]}
              onClick={() => dispatch({ type: "setMaskStyle", value: mode })}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        className="jib-btn"
        data-testid="toggle-spotlight"
        aria-pressed={state.spotlight}
        onClick={() => dispatch({ type: "setSpotlight", value: !state.spotlight })}
      >
        Spotlight
      </button>

      <label className="tbar-radius">
        <span className="tbar-label">Radius</span>
        <input
          type="range"
          data-testid="radius-input"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          step={RADIUS_STEP}
          value={state.radius}
          onChange={(e) => dispatch({ type: "setRadius", value: Number(e.target.value) })}
        />
        <span className="tbar-radius-value">{state.radius}px</span>
      </label>

      <div className="tbar-status">
        <span
          className="tbar-count"
          data-testid="hidden-count"
          data-count={count}
          data-presenting={state.presenting}
        >
          {hiddenLabel(state.presenting, hiddenCount)}
        </span>
        <span className="tbar-hint" data-testid="reveal-hint" data-active={String(active)}>
          Hold <kbd>⌥ Alt</kbd> to reveal all
        </span>
      </div>
    </div>
  );
}
