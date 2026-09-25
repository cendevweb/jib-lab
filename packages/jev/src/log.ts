import type { DecisionRecord } from "./types";

export interface DecisionLog {
  readonly records: readonly DecisionRecord[];
  append(record: Omit<DecisionRecord, "id">): DecisionRecord;
  subscribe(listener: (record: DecisionRecord) => void): () => void;
  filter(tags: Record<string, string>): DecisionRecord[];
  clear(): void;
  toJSON(): DecisionRecord[];
}

/** In-memory, append-only audit log. `limit` keeps the newest N records. */
export function createDecisionLog(options: { limit?: number } = {}): DecisionLog {
  const limit = options.limit ?? 1000;
  let records: DecisionRecord[] = [];
  let counter = 0;
  const listeners = new Set<(r: DecisionRecord) => void>();
  return {
    get records() {
      return records;
    },
    append(input) {
      counter += 1;
      const record = { ...input, id: `d${counter}` } as DecisionRecord;
      records = [...records, record].slice(-limit);
      for (const l of listeners) l(record);
      return record;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    filter(tags) {
      return records.filter((r) => Object.entries(tags).every(([k, v]) => r.tags[k] === v));
    },
    clear() {
      records = [];
      counter = 0;
    },
    toJSON() {
      return [...records];
    },
  };
}
