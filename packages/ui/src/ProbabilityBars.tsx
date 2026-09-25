export interface ProbabilityBarsProps {
  /** Label → probability in [0, 1]. Rendered in descending order. */
  probabilities: Readonly<Record<string, number>>;
  /** Highlighted label (Jev's pick). */
  selected?: string;
  /** Optional overall confidence shown as a caption. */
  confidence?: number;
  label?: string;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Jev distribution as horizontal bars — the visual every Jev demo shares. */
export function ProbabilityBars({
  probabilities,
  selected,
  confidence,
  label,
}: ProbabilityBarsProps) {
  const rows = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <ul className="jib-probs" aria-label={label ?? "probabilities"}>
        {rows.map(([k, p]) => (
          <li key={k} className="jib-prob" data-selected={k === selected} data-label={k}>
            <span className="jib-prob__label">{k}</span>
            <span className="jib-prob__bar">
              <span style={{ width: pct(p) }} />
            </span>
            <span className="jib-prob__value">{pct(p)}</span>
          </li>
        ))}
      </ul>
      {confidence != null ? (
        <span className="jib-caption">confidence {pct(confidence)}</span>
      ) : null}
    </div>
  );
}
