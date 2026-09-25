/**
 * Scripted simulated resolvers + provider (SPEC §5.2).
 * CONTRACT STUB (harness): DEFAULT_SEED is final; resolvers/provider implemented by WP-02.
 */
import type { JevProvider, Resolver } from "@jib/jev";
import type { JevState } from "@/domain/types";

export const DEFAULT_SEED = 7;

export const atcResolvers: Record<string, Resolver<JevState>> = {
  assignee: () => {
    throw new Error("not implemented: atcResolvers.assignee");
  },
  parallelSafe: () => {
    throw new Error("not implemented: atcResolvers.parallelSafe");
  },
  onFailure: () => {
    throw new Error("not implemented: atcResolvers.onFailure");
  },
  blocked: () => {
    throw new Error("not implemented: atcResolvers.blocked");
  },
  risk: () => {
    throw new Error("not implemented: atcResolvers.risk");
  },
};

/** Simulated provider (kind "simulated") answering with `atcResolvers`. */
export function createAtcProvider(_options?: { seed?: number }): JevProvider {
  throw new Error("not implemented: createAtcProvider");
}
