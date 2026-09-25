import { DemoShell } from "@jib/ui";

export default function Page() {
  return (
    <DemoShell title="__TITLE__" hook="__HOOK__" badge="scaffold">
      <p data-testid="scaffold">Scaffold ready. Replace with the demo described in SPEC.md.</p>
    </DemoShell>
  );
}
