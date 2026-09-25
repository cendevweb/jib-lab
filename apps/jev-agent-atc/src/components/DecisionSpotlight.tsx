/**
 * Latest decision + shared state panels (SPEC §6).
 * One ProbabilityBars per answer: choice → its labels, noul → yes/no, score → rubric levels.
 */
import type { DecisionRecord } from "@jib/jev";
import { ProbabilityBars } from "@jib/ui";
import type { ReactElement } from "react";
import { pct } from "./selectors";

type Answer = DecisionRecord["result"]["answers"][string];

type Bars = {
  probabilities: Record<string, number>;
  selected: string;
  confidence: number | undefined;
  headline: string;
};

/** Short level name from a rubric entry: `"medium: shared code"` → `medium`. */
function levelName(entry: unknown, key: string): string {
  if (typeof entry !== "string") return key;
  const name = entry.split(":")[0]?.trim() ?? "";
  return name.length > 0 && name.length <= 16 ? name : key;
}

function barsFor(answer: Answer): Bars {
  if (answer.type === "choice") {
    const probabilities = { ...(answer.probabilities as Record<string, number>) };
    const p = probabilities[answer.choice] ?? 0;
    return {
      probabilities,
      selected: answer.choice,
      confidence: answer.confidence,
      headline: `${answer.choice} ${pct(p)}`,
    };
  }
  if (answer.type === "noul") {
    const yes = answer.noul >= 0.5;
    return {
      probabilities: { yes: answer.noul, no: 1 - answer.noul },
      selected: yes ? "yes" : "no",
      confidence: undefined,
      headline: `${yes ? "yes" : "no"} ${pct(yes ? answer.noul : 1 - answer.noul)}`,
    };
  }
  const legend = answer.legend as Record<string, unknown>;
  const probabilities: Record<string, number> = {};
  let selected = "";
  let best = -1;
  for (const [key, p] of Object.entries(answer.probabilities as Record<string, number>)) {
    const name = levelName(legend[key], key);
    probabilities[name] = p;
    if (p > best) {
      best = p;
      selected = name;
    }
  }
  return {
    probabilities,
    selected,
    confidence: answer.confidence,
    headline: `score ${answer.score.toFixed(1)}`,
  };
}

export function DecisionSpotlight({
  record,
}: {
  record: DecisionRecord | undefined;
}): ReactElement {
  if (!record) {
    return (
      <div className="atc-spotlight" data-testid="latest-decision" data-decision="" data-task="">
        <p className="atc-spotlight__waiting">waiting for Jev…</p>
      </div>
    );
  }
  const task = record.tags.task ?? "";
  return (
    <div
      className="atc-spotlight"
      data-testid="latest-decision"
      data-decision={record.name}
      data-task={task}
    >
      <div className="atc-spotlight__head">
        <span className="atc-spotlight__name" data-kind={record.name}>
          {record.name}
        </span>
        <span className="atc-spotlight__task">{task}</span>
        <span className="atc-spotlight__meta">
          {record.id} · {(record.at / 1000).toFixed(1)}s · {record.provider}
        </span>
      </div>
      {Object.entries(record.result.answers).map(([name, answer]) => {
        const bars = barsFor(answer);
        return (
          <div key={name} className="atc-spotlight__answer" data-type={answer.type}>
            <div className="atc-spotlight__question">
              <code>{name}</code>
              <span className="atc-spotlight__type">{answer.type}</span>
              <span className="atc-spotlight__headline">{bars.headline}</span>
            </div>
            <ProbabilityBars
              label={name}
              probabilities={bars.probabilities}
              selected={bars.selected}
              {...(bars.confidence === undefined ? {} : { confidence: bars.confidence })}
            />
          </div>
        );
      })}
    </div>
  );
}

export function SharedStatePanel({ record }: { record: DecisionRecord | undefined }): ReactElement {
  return (
    <pre className="atc-state" data-testid="shared-state">
      {record ? JSON.stringify(record.request.state, null, 2) : "waiting for the first decision"}
    </pre>
  );
}
