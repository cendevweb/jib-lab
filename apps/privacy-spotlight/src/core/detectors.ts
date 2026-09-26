// Contract stub (harness). WP-01 implements per SPEC §4.2.
import type { DetectorKind, TextMatch } from "./types";

export function detectEmails(_text: string): TextMatch[] {
  throw new Error("not implemented: detectEmails");
}

export function detectPhones(_text: string): TextMatch[] {
  throw new Error("not implemented: detectPhones");
}

export function detectTokens(_text: string): TextMatch[] {
  throw new Error("not implemented: detectTokens");
}

export function detectAccountIds(_text: string): TextMatch[] {
  throw new Error("not implemented: detectAccountIds");
}

export function detectCards(_text: string): TextMatch[] {
  throw new Error("not implemented: detectCards");
}

export const DETECTORS: Record<DetectorKind, (text: string) => TextMatch[]> = {
  email: detectEmails,
  phone: detectPhones,
  token: detectTokens,
  account: detectAccountIds,
  card: detectCards,
};

export function luhnValid(_digits: string): boolean {
  throw new Error("not implemented: luhnValid");
}

export function mergeMatches(_matches: readonly TextMatch[]): TextMatch[] {
  throw new Error("not implemented: mergeMatches");
}

export function detect(_text: string, _kinds?: readonly DetectorKind[]): TextMatch[] {
  throw new Error("not implemented: detect");
}

export function partialRange(
  _match: { start: number; end: number },
  _keep?: number,
): { start: number; end: number } {
  throw new Error("not implemented: partialRange");
}
