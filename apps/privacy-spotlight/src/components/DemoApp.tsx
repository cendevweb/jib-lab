"use client";
// Page wiring (SPEC §4.9): URL params → privacy controller → Toolbar (outside the wrapper),
// <PrivacySpotlight> around the Dashboard, and the scripted tour when `?tour=1`.
import { type ReactElement, useCallback, useState } from "react";
import type { DemoParams, MaskTarget } from "@/core/types";
import { Dashboard } from "@/demo/Dashboard";
import { Toolbar } from "@/demo/Toolbar";
import { PrivacySpotlight, usePrivacySpotlight } from "@/spotlight";
import { TourDriver } from "./TourDriver";
import "./demo-app.css";

export function DemoApp({ params }: { params: DemoParams }): ReactElement {
  const controller = usePrivacySpotlight({
    presenting: params.presenting,
    maskStyle: params.maskStyle,
    spotlight: params.spotlight,
    radius: params.radius,
  });
  const [hiddenCount, setHiddenCount] = useState(0);
  const [userTicket, setUserTicket] = useState(false);
  const [tourTicket, setTourTicket] = useState(false);

  const onTargetsChange = useCallback((targets: MaskTarget[]) => {
    setHiddenCount(targets.length);
  }, []);
  const onAddTicket = useCallback(() => setUserTicket(true), []);

  return (
    <div className="ps-app" data-tour={params.tour}>
      <Toolbar state={controller.state} dispatch={controller.dispatch} hiddenCount={hiddenCount} />
      {params.tour ? (
        <TourDriver
          controller={controller}
          onTicket={setTourTicket}
          initialT={params.t}
          autoplay={params.autoplay}
        />
      ) : null}
      <PrivacySpotlight controller={controller} onTargetsChange={onTargetsChange}>
        <Dashboard ticket={userTicket || tourTicket} onAddTicket={onAddTicket} />
      </PrivacySpotlight>
    </div>
  );
}
