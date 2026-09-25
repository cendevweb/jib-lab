import type { DecisionRecord } from "@jib/jev";
import { pct } from "./ProbabilityBars";

/** One-line summary of every answer in a record: `next=research 82% · retry=yes 23%`. */
export function summarize(record: DecisionRecord): string {
  return Object.entries(record.result.answers)
    .map(([name, a]) => {
      if (a.type === "choice") return `${name}=${a.choice} ${pct(a.confidence)}`;
      if (a.type === "score") return `${name}=${a.score.toFixed(1)}`;
      return `${name}=${a.noul >= 0.5 ? "yes" : "no"} ${pct(a.noul)}`;
    })
    .join(" · ");
}

/** Audit trail of Jev decisions, newest first. */
export function DecisionLogPanel({
  records,
  limit = 20,
}: {
  records: readonly DecisionRecord[];
  limit?: number;
}) {
  const shown = [...records].reverse().slice(0, limit);
  return (
    <ol className="jib-log" aria-label="decision log" data-testid="decision-log">
      {shown.map((r) => (
        <li key={r.id} className="jib-log__item" data-decision={r.name}>
          <strong>{r.name}</strong>
          <span>{summarize(r)}</span>
          <span className="jib-log__meta">
            {r.id} · {r.provider} · {(r.at / 1000).toFixed(1)}s
            {Object.entries(r.tags).map(([k, v]) => ` · ${k}:${v}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}
