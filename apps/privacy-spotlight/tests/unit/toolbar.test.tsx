import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRIVACY_STATE } from "@/core/constants";
import type { PrivacyAction, PrivacyState } from "@/core/types";
import { Toolbar } from "@/demo/Toolbar";

afterEach(cleanup);

const state = (patch: Partial<PrivacyState> = {}): PrivacyState => ({
  ...DEFAULT_PRIVACY_STATE,
  ...patch,
});

function setup(patch: Partial<PrivacyState> = {}, hiddenCount = 35) {
  const dispatch = vi.fn<(a: PrivacyAction) => void>();
  render(<Toolbar state={state(patch)} dispatch={dispatch} hiddenCount={hiddenCount} />);
  return dispatch;
}

const pressed = (id: string) => screen.getByTestId(id).getAttribute("aria-pressed");
const txt = (id: string) => screen.getByTestId(id).textContent?.trim();

describe("<Toolbar>", () => {
  it("[AC-13] aria-pressed mirrors the state", () => {
    setup({ presenting: false, maskStyle: "solid", spotlight: true });
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(pressed("toggle-presenting")).toBe("false");
    expect(pressed("mode-solid")).toBe("true");
    expect(pressed("mode-blur")).toBe("false");
    expect(pressed("mode-partial")).toBe("false");
    expect(pressed("toggle-spotlight")).toBe("true");
    expect(txt("toggle-presenting")).toContain("Presentation mode");
    expect(txt("toggle-spotlight")).toContain("Spotlight");
    cleanup();
    setup({ presenting: true, maskStyle: "blur", spotlight: false });
    expect(pressed("toggle-presenting")).toBe("true");
    expect(pressed("mode-solid")).toBe("false");
    expect(pressed("mode-blur")).toBe("true");
    expect(pressed("mode-partial")).toBe("false");
    expect(pressed("toggle-spotlight")).toBe("false");
  });

  it("[AC-13] clicks dispatch togglePresenting, setMaskStyle and setSpotlight(!spotlight)", () => {
    const dispatch = setup({ presenting: true, spotlight: true });
    fireEvent.click(screen.getByTestId("toggle-presenting"));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "togglePresenting" });
    fireEvent.click(screen.getByTestId("mode-blur"));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setMaskStyle", value: "blur" });
    fireEvent.click(screen.getByTestId("mode-partial"));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setMaskStyle", value: "partial" });
    fireEvent.click(screen.getByTestId("mode-solid"));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setMaskStyle", value: "solid" });
    fireEvent.click(screen.getByTestId("toggle-spotlight"));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setSpotlight", value: false });
    cleanup();
    const d2 = setup({ spotlight: false });
    fireEvent.click(screen.getByTestId("toggle-spotlight"));
    expect(d2).toHaveBeenLastCalledWith({ type: "setSpotlight", value: true });
  });

  it("[AC-13] radius-input is a 40–320 range bound to radius and dispatches setRadius", () => {
    const dispatch = setup({ radius: 110 });
    const input = screen.getByTestId("radius-input") as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(input.min).toBe("40");
    expect(input.max).toBe("320");
    expect(input.step).toBe("10");
    expect(input.value).toBe("110");
    fireEvent.change(input, { target: { value: "200" } });
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setRadius", value: 200 });
  });

  it("[AC-13] mode-blur warns that blur is cosmetic", () => {
    setup();
    expect(screen.getByTestId("mode-blur").getAttribute("title")).toContain("leak");
  });

  it("[AC-13] hidden-count shows the count while presenting, Not presenting otherwise", () => {
    setup({ presenting: true }, 35);
    expect(txt("hidden-count")).toBe("35 values hidden");
    expect(screen.getByTestId("hidden-count").getAttribute("data-count")).toBe("35");
    cleanup();
    setup({ presenting: true }, 1);
    expect(txt("hidden-count")).toBe("1 value hidden");
    expect(screen.getByTestId("hidden-count").getAttribute("data-count")).toBe("1");
    cleanup();
    setup({ presenting: false }, 35);
    expect(txt("hidden-count")).toBe("Not presenting");
    expect(screen.getByTestId("hidden-count").getAttribute("data-count")).toBe("0");
  });

  it("[AC-13] reveal-hint is active only when presenting and holding", () => {
    setup({ presenting: true, holding: true });
    expect(txt("reveal-hint")).toContain("Alt");
    expect(screen.getByTestId("reveal-hint").getAttribute("data-active")).toBe("true");
    cleanup();
    setup({ presenting: false, holding: true });
    expect(screen.getByTestId("reveal-hint").getAttribute("data-active")).toBe("false");
    cleanup();
    setup({ presenting: true, holding: false });
    expect(screen.getByTestId("reveal-hint").getAttribute("data-active")).toBe("false");
  });
});
