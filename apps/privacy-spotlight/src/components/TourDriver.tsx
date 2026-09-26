"use client";
// Scripted tour driver (SPEC §4.9). Mounted only with `?tour=1`. Every frame is derived from the
// player's virtual time `t`: the timeline frame is synced into the privacy controller and the
// ghost cursor is placed between two testid targets, then fed to the wrapper as the pointer.
import { ScenarioControls, useScenarioPlayer } from "@jib/ui";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Point } from "@/core/types";
import { createTour, cursorAt } from "@/scenario/tour";
import type { PrivacyController } from "@/spotlight";
import "./demo-app.css";

type TourDriverProps = {
  controller: PrivacyController;
  onTicket: (ticket: boolean) => void;
  initialT: number;
  autoplay: boolean;
};

const byTestId = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

/** Viewport centre of the element with this testid, or null when it is not rendered. */
function centreOf(id: string | null): Point | null {
  if (id === null) return null;
  const el = byTestId(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export function TourDriver({
  controller,
  onTicket,
  initialT,
  autoplay,
}: TourDriverProps): ReactElement {
  const [tour] = useState(createTour);
  const player = useScenarioPlayer(tour, { initialT, autoplay });
  const { dispatch } = controller;
  const { presenting, maskStyle, holding, ticket } = player.state;
  const cursor = cursorAt(player.t);

  const ghostRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(player.t);
  tRef.current = player.t;

  // Timeline frame → privacy state, committed before paint (masks change in the beat's frame).
  useLayoutEffect(() => {
    dispatch({ type: "sync", patch: { presenting, maskStyle, holding } });
  }, [dispatch, presenting, maskStyle, holding]);

  useLayoutEffect(() => {
    onTicket(ticket);
  }, [onTicket, ticket]);

  /** Place the ghost cursor for the current t and feed it to the wrapper as the pointer. */
  const place = useCallback(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    const { from, to, progress } = cursorAt(tRef.current);
    const b = centreOf(to);
    if (!b) return;
    const a = centreOf(from) ?? b;
    const p: Point = { x: lerp(a.x, b.x, progress), y: lerp(a.y, b.y, progress) };
    ghost.style.transform = `translate(${p.x}px, ${p.y}px)`;
    ghost.dataset.placed = "true";

    const root = byTestId("privacy-root");
    const rr = root?.getBoundingClientRect();
    if (rr && p.x >= rr.left && p.x <= rr.right && p.y >= rr.top && p.y <= rr.bottom) {
      dispatch({ type: "pointerMove", point: { x: p.x - rr.left, y: p.y - rr.top } });
    } else {
      dispatch({ type: "pointerLeave" });
    }
  }, [dispatch]);

  // Every tick of virtual time (and every ticket/layout change it causes).
  useLayoutEffect(() => {
    place();
  }, [place, player.t, ticket]);

  // Layout can move after the frame (fonts, scroll, resize, new ticket): keep the cursor on target.
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(document.body);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) place();
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      ro?.disconnect();
    };
  }, [place]);

  // Hands-free recording: hide the real cursor while the tour is mounted, and keep a stray real
  // mouse from fighting the ghost (its moves never reach the wrapper's pointer listeners).
  useEffect(() => {
    document.body.classList.add("ps-tour");
    const swallow = (e: MouseEvent) => {
      const root = byTestId("privacy-root");
      if (root && e.target instanceof Node && root.contains(e.target)) e.stopPropagation();
    };
    window.addEventListener("mousemove", swallow, { capture: true });
    window.addEventListener("mouseleave", swallow, { capture: true });
    return () => {
      document.body.classList.remove("ps-tour");
      window.removeEventListener("mousemove", swallow, { capture: true });
      window.removeEventListener("mouseleave", swallow, { capture: true });
    };
  }, []);

  return (
    <>
      <div className="ps-tour-controls">
        <ScenarioControls player={player} />
      </div>
      <div ref={ghostRef} className="ps-ghost" data-testid="ghost-cursor" data-target={cursor.to}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.8 L10.6 14 L17 14 Z" />
        </svg>
      </div>
    </>
  );
}
