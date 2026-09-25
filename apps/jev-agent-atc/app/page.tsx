import { DemoShell } from "@jib/ui";
import { ControlTower } from "@/components/ControlTower";
import { parsePlayerParams } from "@/scenario/params";
import { runScenario } from "@/scenario/run";

/**
 * SPEC §4.6: the page always uses the simulated provider (reproducible recording). The run is a
 * pure function of the seed, so it is computed once per server process and reused.
 */
let runPromise: ReturnType<typeof runScenario> | null = null;
function scenarioRun(): ReturnType<typeof runScenario> {
  runPromise ??= runScenario();
  return runPromise;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const run = await scenarioRun();
  const { initialT, autoplay } = parsePlayerParams(sp);
  return (
    <DemoShell
      title="Jev Agent Air-Traffic Controller"
      hook="I stopped letting my AI agents decide what to do next. Jev does it for them."
      badge={`Jev · ${run.provider}`}
    >
      <ControlTower run={run} initialT={initialT} autoplay={autoplay} />
    </DemoShell>
  );
}
