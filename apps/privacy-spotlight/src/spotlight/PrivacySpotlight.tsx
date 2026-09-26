"use client";
// <PrivacySpotlight> (SPEC §4.6): scans its children for sensitive values and paints a sibling
// overlay of masks over them. Fail-closed: scans run before paint (layout effect on present,
// MutationObserver + flushSync on content changes).
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { KIND_LABELS } from "@/core/constants";
import { computeOverlay } from "@/core/overlay";
import type { DetectorKind, MaskTarget, PrivacyAction, PrivacyState, Rect } from "@/core/types";
import { type MeasureFn, scanSensitive } from "./scanner";
import { type PrivacyController, usePrivacySpotlight } from "./usePrivacySpotlight";
import "./privacy-spotlight.css";

export type PrivacySpotlightProps = {
  children: ReactNode;
  /** Controlled mode (demo toolbar). Absent → internal controller from `initial`. */
  controller?: PrivacyController;
  initial?: Partial<PrivacyState>;
  detectors?: readonly DetectorKind[];
  measure?: MeasureFn;
  padding?: number;
  /** Called after every scan with the current targets ([] when not presenting). */
  onTargetsChange?: (targets: MaskTarget[]) => void;
  className?: string;
};

const NO_TARGETS: MaskTarget[] = [];
const OBSERVED_ATTRIBUTES = ["data-sensitive", "data-privacy-ignore"];

function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => {
    const o = b[i];
    return !!o && r.x === o.x && r.y === o.y && r.width === o.width && r.height === o.height;
  });
}

/** Structural equality, so identical rescans (scroll, resize) keep the same array and skip renders. */
function sameTargets(a: readonly MaskTarget[], b: readonly MaskTarget[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => {
    const o = b[i];
    return (
      !!o &&
      t.id === o.id &&
      t.kind === o.kind &&
      t.owner === o.owner &&
      sameRects(t.rects, o.rects) &&
      sameRects(t.partialRects, o.partialRects)
    );
  });
}

/** Top-left of the root's padding box in viewport px (absolute children are placed against it). */
function originOf(root: HTMLElement): { x: number; y: number } {
  const r = root.getBoundingClientRect();
  return { x: r.left + root.clientLeft, y: r.top + root.clientTop };
}

export function PrivacySpotlight(props: PrivacySpotlightProps): ReactElement {
  const { children, controller, initial, detectors, measure, padding, onTargetsChange, className } =
    props;
  const internal = usePrivacySpotlight(initial);
  const { state, dispatch } = controller ?? internal;

  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [targets, setTargets] = useState<MaskTarget[]>(NO_TARGETS);
  const targetsRef = useRef<MaskTarget[]>(NO_TARGETS);
  /** False until the first scan: content stays hidden while presenting (SSR / hydration). */
  const [ready, setReady] = useState(false);

  // Latest props/state for long-lived listeners and observers.
  const latest = useRef({ state, dispatch, detectors, measure, padding, onTargetsChange });
  useLayoutEffect(() => {
    latest.current = { state, dispatch, detectors, measure, padding, onTargetsChange };
  });

  const commit = useCallback((next: MaskTarget[]) => {
    const value = sameTargets(targetsRef.current, next) ? targetsRef.current : next;
    targetsRef.current = value;
    setTargets(value);
    latest.current.onTargetsChange?.(value);
  }, []);

  const scan = useCallback(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    const { detectors: kinds, measure: m, padding: pad } = latest.current;
    commit(
      scanSensitive(content, {
        origin: originOf(root),
        detectors: kinds,
        measure: m,
        padding: pad,
      }),
    );
  }, [commit]);

  const presenting = state.presenting;
  const detectorsKey = detectors ? detectors.join(",") : "*";

  // Scanning (fail-closed): synchronous scan before paint, then observers while presenting.
  // `scan` reads the options through `latest`; they are listed so option changes rescan.
  useLayoutEffect(() => {
    if (!presenting) {
      targetsRef.current = NO_TARGETS;
      setTargets(NO_TARGETS);
      latest.current.onTargetsChange?.(NO_TARGETS);
      return;
    }
    scan();
    setReady(true);

    const content = contentRef.current;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        flushSync(scan);
      });
    };

    const mutations =
      typeof MutationObserver !== "undefined" ? new MutationObserver(() => flushSync(scan)) : null;
    const resizes = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (content) {
      mutations?.observe(content, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: OBSERVED_ATTRIBUTES,
      });
      resizes?.observe(content);
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    let alive = true;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(() => {
      if (alive) schedule();
    });

    return () => {
      alive = false;
      mutations?.disconnect();
      resizes?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [presenting, scan, detectorsKey, measure, padding]);

  // Pointer: mouse events on the root (jsdom 26 has no PointerEvent).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const send = (action: PrivacyAction) => latest.current.dispatch(action);
    const onMove = (e: MouseEvent) => {
      const o = originOf(root);
      send({ type: "pointerMove", point: { x: e.clientX - o.x, y: e.clientY - o.y } });
    };
    const onLeave = () => send({ type: "pointerLeave" });
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // Keys: hold-to-reveal on window; blur / hidden tab releases (fail closed).
  useEffect(() => {
    const send = (action: PrivacyAction) => latest.current.dispatch(action);
    const onKeyDown = (e: KeyboardEvent) => {
      const s = latest.current.state;
      if (e.key !== s.revealKey || !s.presenting) return;
      e.preventDefault(); // keep Alt from focusing browser menus while presenting
      send({ type: "keyDown", key: e.key });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== latest.current.state.revealKey) return;
      send({ type: "keyUp", key: e.key });
    };
    const onBlur = () => send({ type: "release" });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send({ type: "release" });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const view = computeOverlay(state, targets);
  const concealContent = view.presenting && !ready;

  return (
    <div
      ref={rootRef}
      data-testid="privacy-root"
      className={className ? `ps-root ${className}` : "ps-root"}
      style={{ position: "relative" }}
    >
      <div
        ref={contentRef}
        className="ps-content"
        style={{
          position: "relative",
          zIndex: 0,
          visibility: concealContent ? "hidden" : undefined,
        }}
      >
        {children}
      </div>
      <div
        data-testid="privacy-overlay"
        data-privacy-overlay=""
        aria-hidden="true"
        className="ps-overlay"
        data-presenting={String(view.presenting)}
        data-mode={view.mode}
        data-reveal={view.reveal}
        data-count={view.count}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
      >
        {view.masks.map((m) => (
          <div
            key={m.key}
            data-testid="privacy-mask"
            className={`ps-mask ps-mask--${view.mode}`}
            data-kind={m.kind}
            data-label={KIND_LABELS[m.kind]}
            data-target={m.targetId}
            data-owner={m.owner ?? ""}
            data-revealed={String(m.revealed)}
            style={{
              position: "absolute",
              left: m.rect.x,
              top: m.rect.y,
              width: m.rect.width,
              height: m.rect.height,
              maskImage: m.maskImage ?? undefined,
              WebkitMaskImage: m.maskImage ?? undefined,
            }}
          />
        ))}
        {view.spotlight ? (
          <div
            data-testid="privacy-spotlight"
            className="ps-spotlight"
            data-x={Math.round(view.spotlight.x)}
            data-y={Math.round(view.spotlight.y)}
            data-radius={view.spotlight.radius}
            style={{
              position: "absolute",
              left: view.spotlight.x,
              top: view.spotlight.y,
              width: 2 * view.spotlight.radius,
              height: 2 * view.spotlight.radius,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
