import { DemoShell } from "@jib/ui";

export default function Page() {
  return (
    <DemoShell
      title="Jev Agent Air-Traffic Controller"
      hook="I stopped letting my AI agents decide what to do next. Jev does it for them."
      badge="scaffold"
    >
      <p data-testid="scaffold">Scaffold ready. Replace with the demo described in SPEC.md.</p>
    </DemoShell>
  );
}
