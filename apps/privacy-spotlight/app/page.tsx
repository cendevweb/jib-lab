import { DemoShell } from "@jib/ui";
import { DemoApp } from "@/components/DemoApp";
import { parseDemoParams } from "@/core/params";

/**
 * SPEC §4.9: the server page parses the query (`?present=1&mode=…&spotlight=0&radius=…`,
 * `?tour=1&t=…&autoplay=1`) and renders the client DemoApp. Offline: static fake data only.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <DemoShell
      title="Privacy Spotlight"
      hook="I made a React component for screen sharing without leaking your data."
      badge="offline · fake data"
      footer={
        <p className="ps-threat" data-testid="threat-note">
          <strong>Visual protection for screen sharing only. Values stay in the DOM.</strong> They
          are still in the accessibility tree, copy/paste, devtools and network responses. The
          spotlight and hold-⌥ reveal show real pixels to your audience, on purpose. Blur is
          cosmetic: use Solid on real calls.
        </p>
      }
    >
      <DemoApp params={parseDemoParams(sp)} />
    </DemoShell>
  );
}
