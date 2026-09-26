import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaskTarget } from "@/core/types";
import * as barrel from "@/spotlight";
import { PrivacySpotlight } from "@/spotlight/PrivacySpotlight";
import { type PrivacyController, usePrivacySpotlight } from "@/spotlight/usePrivacySpotlight";
import { createMeasure } from "./fake-measure";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "visibilityState");
  Reflect.deleteProperty(document, "hidden");
});

/**
 * Content measured by the fake measure (jsdom: privacy-root rect is (0,0), so local = viewport).
 * Padded rects (padding 2): near (-2,-2,132,20) · name (-2,38,84,20) · far (598,398,164,20) ·
 * orphan (-2,78,164,20), in that document order (t0…t3).
 */
function Content() {
  return (
    <div>
      <span data-testid="near" data-box="0,0">
        near@example.com
      </span>
      <span data-testid="name" data-sensitive="" data-box="0,40,80,16">
        Maya Chen
      </span>
      <span data-testid="far" data-box="600,400">
        far.away@example.com
      </span>
      <p data-box="0,80">no.owner@example.com</p>
      <span data-testid="plain" data-box="0,120">
        Plan: Pro · $490 · 2026-09-26
      </span>
    </div>
  );
}

const masks = () => screen.queryAllByTestId("privacy-mask");
const overlay = () => screen.getByTestId("privacy-overlay");
const maskOf = (owner: string) => {
  const m = masks().find((el) => el.getAttribute("data-owner") === owner);
  if (!m) throw new Error(`no mask for ${owner}`);
  return m;
};

function renderPresenting(onTargetsChange?: (t: MaskTarget[]) => void) {
  const { measure } = createMeasure();
  return render(
    <PrivacySpotlight
      initial={{ presenting: true }}
      measure={measure}
      onTargetsChange={onTargetsChange}
    >
      <Content />
    </PrivacySpotlight>,
  );
}

describe("<PrivacySpotlight> render", () => {
  it("[AC-10] not presenting → overlay data-presenting=false and no masks", () => {
    const { measure } = createMeasure();
    render(
      <PrivacySpotlight initial={{ presenting: false }} measure={measure}>
        <Content />
      </PrivacySpotlight>,
    );
    expect(screen.getByTestId("privacy-root")).toBeTruthy();
    expect(overlay().getAttribute("data-presenting")).toBe("false");
    expect(overlay().getAttribute("data-count")).toBe("0");
    expect(masks()).toHaveLength(0);
    expect(screen.queryByTestId("privacy-spotlight")).toBeNull();
    expect(screen.getByTestId("near").textContent).toBe("near@example.com");
  });

  it("[AC-10] presenting → masks exist right after render with the contract attributes", () => {
    renderPresenting();
    const o = overlay();
    expect(o.getAttribute("aria-hidden")).toBe("true");
    expect(o.getAttribute("data-presenting")).toBe("true");
    expect(o.getAttribute("data-mode")).toBe("solid");
    expect(o.getAttribute("data-reveal")).toBe("none");
    expect(o.getAttribute("data-count")).toBe("4");
    expect(o.contains(screen.getByTestId("near"))).toBe(false); // overlay is a sibling
    const all = masks();
    expect(all).toHaveLength(4);
    expect(
      all.map((m) => [
        m.getAttribute("data-target"),
        m.getAttribute("data-kind"),
        m.getAttribute("data-label"),
        m.getAttribute("data-owner"),
        m.getAttribute("data-revealed"),
      ]),
    ).toEqual([
      ["t0", "email", "EMAIL", "near", "false"],
      ["t1", "marked", "PRIVATE", "name", "false"],
      ["t2", "email", "EMAIL", "far", "false"],
      ["t3", "email", "EMAIL", "", "false"],
    ]);
    const near = maskOf("near");
    expect([near.style.left, near.style.top, near.style.width, near.style.height]).toEqual([
      "-2px",
      "-2px",
      "132px",
      "20px",
    ]);
    const far = maskOf("far");
    expect([far.style.left, far.style.top, far.style.width, far.style.height]).toEqual([
      "598px",
      "398px",
      "164px",
      "20px",
    ]);
  });

  it("[AC-10] mouseMove on privacy-root shows the spotlight and reveals nearby masks only", () => {
    renderPresenting();
    fireEvent.mouseMove(screen.getByTestId("privacy-root"), { clientX: 10, clientY: 8 });
    const spot = screen.getByTestId("privacy-spotlight");
    expect(spot.getAttribute("data-x")).toBe("10");
    expect(spot.getAttribute("data-y")).toBe("8");
    expect(spot.getAttribute("data-radius")).toBe("110");
    expect(overlay().getAttribute("data-reveal")).toBe("spotlight");
    expect(maskOf("near").getAttribute("data-revealed")).toBe("true");
    expect(maskOf("name").getAttribute("data-revealed")).toBe("true");
    expect(maskOf("far").getAttribute("data-revealed")).toBe("false");
    expect(maskOf("").getAttribute("data-revealed")).toBe("true");
  });

  it("[AC-10] moving far away changes which masks are revealed; mouseLeave removes the spotlight", () => {
    renderPresenting();
    const root = screen.getByTestId("privacy-root");
    fireEvent.mouseMove(root, { clientX: 680, clientY: 408 });
    expect(maskOf("far").getAttribute("data-revealed")).toBe("true");
    expect(maskOf("near").getAttribute("data-revealed")).toBe("false");
    expect(screen.getByTestId("privacy-spotlight").getAttribute("data-x")).toBe("680");
    fireEvent.mouseLeave(root);
    expect(screen.queryByTestId("privacy-spotlight")).toBeNull();
    expect(overlay().getAttribute("data-reveal")).toBe("none");
    expect(masks().every((m) => m.getAttribute("data-revealed") === "false")).toBe(true);
  });

  it("[AC-10] the public barrel exports the component, hook, scanner and core helpers", () => {
    expect(typeof barrel.PrivacySpotlight).toBe("function");
    expect(typeof barrel.usePrivacySpotlight).toBe("function");
    expect(typeof barrel.scanSensitive).toBe("function");
    expect(typeof barrel.defaultMeasure).toBe("function");
    expect(typeof barrel.detect).toBe("function");
    expect(typeof barrel.computeOverlay).toBe("function");
    expect(typeof barrel.createPrivacyState).toBe("function");
    expect(barrel.DETECTOR_KINDS).toEqual(["email", "phone", "token", "account", "card"]);
    expect(barrel.MASK_STYLES).toEqual(["solid", "blur", "partial"]);
  });
});

describe("<PrivacySpotlight> behaviour", () => {
  it("[AC-11] holding Alt on window reveals all; releasing masks again", () => {
    renderPresenting();
    const notPrevented = fireEvent.keyDown(window, { key: "Alt" });
    expect(notPrevented).toBe(false); // preventDefault on the reveal key while presenting
    expect(overlay().getAttribute("data-reveal")).toBe("all");
    expect(masks()).toHaveLength(4);
    expect(masks().every((m) => m.getAttribute("data-revealed") === "true")).toBe(true);
    fireEvent.keyUp(window, { key: "Alt" });
    expect(overlay().getAttribute("data-reveal")).toBe("none");
    expect(masks().every((m) => m.getAttribute("data-revealed") === "false")).toBe(true);
  });

  it("[AC-11] other keys do nothing", () => {
    renderPresenting();
    fireEvent.keyDown(window, { key: "Shift" });
    expect(overlay().getAttribute("data-reveal")).toBe("none");
  });

  it("[AC-11] window blur while holding Alt fails closed", () => {
    renderPresenting();
    fireEvent.keyDown(window, { key: "Alt" });
    expect(overlay().getAttribute("data-reveal")).toBe("all");
    fireEvent.blur(window);
    expect(overlay().getAttribute("data-reveal")).toBe("none");
    expect(masks().every((m) => m.getAttribute("data-revealed") === "false")).toBe(true);
  });

  it("[AC-11] document hidden while holding Alt fails closed", () => {
    renderPresenting();
    fireEvent.keyDown(window, { key: "Alt" });
    expect(overlay().getAttribute("data-reveal")).toBe("all");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    fireEvent(document, new Event("visibilitychange"));
    expect(overlay().getAttribute("data-reveal")).toBe("none");
  });

  it("[AC-11] new content is masked (MutationObserver) and reported via onTargetsChange", async () => {
    const onTargetsChange = vi.fn<(t: MaskTarget[]) => void>();
    renderPresenting(onTargetsChange);
    expect(masks()).toHaveLength(4);
    expect(onTargetsChange).toHaveBeenCalled();
    expect(onTargetsChange.mock.lastCall?.[0]).toHaveLength(4);
    const host = screen.getByTestId("near").parentElement;
    if (!host) throw new Error("content host missing");
    act(() => {
      const span = document.createElement("span");
      span.setAttribute("data-testid", "late");
      span.setAttribute("data-box", "0,160");
      span.textContent = "late@example.com";
      host.appendChild(span);
    });
    await waitFor(() => expect(masks()).toHaveLength(5));
    expect(overlay().getAttribute("data-count")).toBe("5");
    expect(maskOf("late").getAttribute("data-kind")).toBe("email");
    const last = onTargetsChange.mock.lastCall?.[0] ?? [];
    expect(last).toHaveLength(5);
    expect(last.find((t) => t.owner === "late")).toMatchObject({ kind: "email" });
  });

  it("[AC-11] a controller from usePrivacySpotlight drives mode and presenting", () => {
    const onTargetsChange = vi.fn<(t: MaskTarget[]) => void>();
    const { measure } = createMeasure();
    const ref: { current: PrivacyController | null } = { current: null };
    function Harness() {
      const controller = usePrivacySpotlight({ presenting: true });
      ref.current = controller;
      return (
        <PrivacySpotlight
          controller={controller}
          measure={measure}
          onTargetsChange={onTargetsChange}
        >
          <Content />
        </PrivacySpotlight>
      );
    }
    render(<Harness />);
    expect(masks()).toHaveLength(4);
    act(() => ref.current?.dispatch({ type: "setMaskStyle", value: "blur" }));
    expect(ref.current?.state.maskStyle).toBe("blur");
    expect(overlay().getAttribute("data-mode")).toBe("blur");
    expect(masks()).toHaveLength(4);
    act(() => ref.current?.dispatch({ type: "setPresenting", value: false }));
    expect(masks()).toHaveLength(0);
    expect(overlay().getAttribute("data-presenting")).toBe("false");
    expect(onTargetsChange).toHaveBeenLastCalledWith([]);
    // Alt is not swallowed when not presenting
    expect(fireEvent.keyDown(window, { key: "Alt" })).toBe(true);
    act(() => ref.current?.dispatch({ type: "setPresenting", value: true }));
    expect(masks()).toHaveLength(4);
    expect(onTargetsChange.mock.lastCall?.[0]).toHaveLength(4);
  });
});
