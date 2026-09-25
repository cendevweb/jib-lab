/**
 * Scripted simulated resolvers + provider (SPEC §5.2).
 * Deterministic: the only noise is the seeded `assignee` probability, so the seed matters.
 */
import { createSimulatedProvider, type JevProvider, type Resolver } from "@jib/jev";
import type { Dependency, JevState, JevTaskView, TaskId } from "@/domain/types";

export const DEFAULT_SEED = 7;

type View = JevTaskView;

/** Resolvers can be reached with arbitrary request state via the route; answer only ours. */
function isJevState(x: unknown): x is JevState {
  if (x === null || typeof x !== "object") return false;
  const s = x as Partial<JevState>;
  return (
    typeof s.focus === "object" &&
    s.focus !== null &&
    typeof s.focus.taskId === "string" &&
    Array.isArray(s.tasks) &&
    Array.isArray(s.dependencies) &&
    Array.isArray(s.recentFailures) &&
    typeof s.changedFiles === "object" &&
    s.changedFiles !== null
  );
}

function focusOf(state: JevState): View | undefined {
  return state.tasks.find((t) => t.id === state.focus.taskId);
}

function viewOf(state: JevState, id: TaskId): View | undefined {
  return state.tasks.find((t) => t.id === id);
}

/** Dependencies where the focus task is the dependent. */
function focusDeps(state: JevState): Dependency[] {
  return state.dependencies.filter((d) => d.task === state.focus.taskId);
}

/** failed / retrying / escalated, or being investigated by Research. */
function isBroken(t: View): boolean {
  return (
    t.status === "failed" ||
    t.status === "retrying" ||
    t.status === "escalated" ||
    t.stage === "investigate"
  );
}

function inRecentFailures(state: JevState, id: TaskId): boolean {
  return state.recentFailures.some((f) => f.taskId === id);
}

const assignee: Resolver<JevState> = ({ state, question, noise }) => {
  if (!isJevState(state) || question.type !== "choice") return undefined;
  const focus = focusOf(state);
  if (!focus) return undefined;
  const preferred = focus.kind;
  const p = 0.8 + 0.12 * noise();
  const labels = Object.keys(question.criteria);
  const others = labels.filter((l) => l !== preferred);
  const rest = others.length > 0 ? (1 - p) / others.length : 0;
  return Object.fromEntries(labels.map((l) => [l, l === preferred ? p : rest]));
};

const parallelSafe: Resolver<JevState> = ({ state }) => {
  if (!isJevState(state)) return undefined;
  const unfinished = focusDeps(state)
    .map((d) => ({ dep: d, on: viewOf(state, d.on) }))
    .filter((x) => x.on !== undefined && x.on.status !== "done");
  if (unfinished.length === 0) return 0.94;
  if (unfinished.some((x) => x.on && isBroken(x.on))) return 0.05;
  if (unfinished.every((x) => x.dep.kind === "contract")) return 0.72;
  return 0.12;
};

const blocked: Resolver<JevState> = ({ state }) => {
  if (!isJevState(state)) return undefined;
  const deps = focusDeps(state)
    .map((d) => viewOf(state, d.on))
    .filter((t): t is View => t !== undefined);
  if (deps.some(isBroken)) return 0.91;
  if (deps.some((t) => t.status === "review")) return 0.22;
  const focusId = state.focus.taskId;
  const mine = new Set(state.changedFiles[focusId] ?? []);
  const sharesWithFailure = state.recentFailures.some((f) => {
    if (f.taskId === focusId) return false;
    const t = viewOf(state, f.taskId);
    if (!t || t.status === "done") return false;
    return (state.changedFiles[f.taskId] ?? []).some((file) => mine.has(file));
  });
  return sharesWithFailure ? 0.55 : 0.04;
};

const risk: Resolver<JevState> = ({ state }) => {
  if (!isJevState(state)) return undefined;
  const focus = focusOf(state);
  if (!focus) return undefined;
  if (focus.attempt >= 2 || inRecentFailures(state, focus.id)) return [0.02, 0.08, 0.3, 0.6];
  if (focus.kind === "research") return [0.7, 0.22, 0.06, 0.02];
  if (focus.kind === "tests") return [0.45, 0.4, 0.12, 0.03];
  if (focusDeps(state).length > 0) return [0.05, 0.2, 0.45, 0.3];
  return [0.3, 0.4, 0.2, 0.1];
};

/** Weights in label order [retry, research, escalate]. */
const onFailure: Resolver<JevState> = ({ state }) => {
  if (!isJevState(state)) return undefined;
  const focus = focusOf(state);
  if (!focus) return undefined;
  if (focus.attempt >= 2) return { retry: 0.08, research: 0.22, escalate: 0.7 };
  const latest = state.recentFailures.filter((f) => f.taskId === focus.id).at(-1);
  if (latest?.kind === "flaky") return { retry: 0.78, research: 0.15, escalate: 0.07 };
  return { retry: 0.18, research: 0.76, escalate: 0.06 };
};

export const atcResolvers: Record<string, Resolver<JevState>> = {
  assignee,
  parallelSafe,
  onFailure,
  blocked,
  risk,
};

/** Simulated provider (kind "simulated") answering with `atcResolvers`. */
export function createAtcProvider(options: { seed?: number } = {}): JevProvider {
  return createSimulatedProvider<JevState>({
    resolvers: atcResolvers,
    seed: options.seed ?? DEFAULT_SEED,
  });
}
