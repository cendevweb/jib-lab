import { DETECTOR_KINDS, KIND_PRIORITY, PARTIAL_KEEP } from "./constants";
import type { DetectorKind, TextMatch } from "./types";

/*
 * All regexes are linear-time: every quantified class is either followed by a disjoint
 * delimiter or anchored by a lookbehind that rejects mid-run starts, so no nested ambiguity.
 * Global regexes are only consumed through `matchAll`, which clones them (no shared lastIndex).
 */

type Validate = (value: string) => boolean;

function scan(
  kind: DetectorKind,
  text: string,
  re: RegExp,
  validate?: Validate,
  out: TextMatch[] = [],
): TextMatch[] {
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (validate && !validate(m[0])) continue;
    out.push({ kind, start, end: start + m[0].length });
  }
  return out;
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9";
const isWordOrDash = (c: string | undefined): boolean => c !== undefined && /[\w-]/.test(c);

function countMatching(s: string, re: RegExp): number {
  let n = 0;
  for (const c of s) if (re.test(c)) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// email

const EMAIL_RE =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;

export function detectEmails(text: string): TextMatch[] {
  return mergeMatches(scan("email", text, EMAIL_RE));
}

// ---------------------------------------------------------------------------------------------
// phone

/** NANP without `+`: (ddd) ddd-dddd, ddd-ddd-dddd, ddd.ddd.dddd, ddd ddd dddd. */
const NANP_RE = /(?<![\w+-])(?:\(\d{3}\) \d{3}-\d{4}|\d{3}([-. ])\d{3}\1\d{4})(?![\w-])/g;

const PHONE_SEPARATORS = " .-";

/** Parses one group (digit run, or `(` 1–4 digits `)`) at i; returns [end, digits] or null. */
function phoneGroup(text: string, i: number): [number, number] | null {
  if (isDigit(text[i])) {
    let j = i;
    while (isDigit(text[j])) j++;
    return [j, j - i];
  }
  if (text[i] === "(") {
    let j = i + 1;
    while (isDigit(text[j]) && j - i - 1 < 5) j++;
    const n = j - i - 1;
    if (n >= 1 && n <= 4 && text[j] === ")") return [j + 1, n];
  }
  return null;
}

/** International: `+` + digit groups with single optional separators, 8–15 digits total. */
function detectIntlPhones(text: string, out: TextMatch[]): void {
  for (let i = text.indexOf("+"); i !== -1; i = text.indexOf("+", i + 1)) {
    const prev = text[i - 1];
    if (prev !== undefined && /[\w+]/.test(prev)) continue;
    if (!isDigit(text[i + 1])) continue;
    const ends: [number, number][] = [];
    let j = i + 1;
    let digits = 0;
    for (;;) {
      const group = phoneGroup(text, j);
      if (!group) break;
      digits += group[1];
      j = group[0];
      ends.push([j, digits]);
      let k = j;
      if (PHONE_SEPARATORS.includes(text[k] ?? "\0")) k++;
      if (!phoneGroup(text, k)) break;
      j = k;
    }
    for (let e = ends.length - 1; e >= 0; e--) {
      const [end, n] = ends[e] as [number, number];
      if (n >= 8 && n <= 15 && !isWordOrDash(text[end])) {
        out.push({ kind: "phone", start: i, end });
        break;
      }
    }
  }
}

export function detectPhones(text: string): TextMatch[] {
  const out: TextMatch[] = [];
  detectIntlPhones(text, out);
  scan("phone", text, NANP_RE, undefined, out);
  return mergeMatches(out);
}

// ---------------------------------------------------------------------------------------------
// token

const TOKEN_B = "(?<![A-Za-z0-9_-])";
const TOKEN_A = "(?![A-Za-z0-9_-])";
const TOKEN_RES: RegExp[] = [
  // (a) Stripe-style
  /(?<![A-Za-z0-9_])[a-z]{2,8}_(?:live|test)_[A-Za-z0-9]{16,}(?![A-Za-z0-9_])/g,
  // (b) vendor prefixes
  new RegExp(`${TOKEN_B}gh[pousr]_[A-Za-z0-9]{30,}${TOKEN_A}`, "g"),
  new RegExp(`${TOKEN_B}github_pat_[A-Za-z0-9_]{40,}${TOKEN_A}`, "g"),
  new RegExp(`${TOKEN_B}xox[abprs]-[A-Za-z0-9-]{10,}${TOKEN_A}`, "g"),
  new RegExp(`${TOKEN_B}AKIA[0-9A-Z]{16}${TOKEN_A}`, "g"),
  new RegExp(`${TOKEN_B}AIza[0-9A-Za-z_-]{35}${TOKEN_A}`, "g"),
  new RegExp(`${TOKEN_B}sk-(?:proj-)?[A-Za-z0-9_-]{20,}${TOKEN_A}`, "g"),
  // (c) JWT: 3 base64url segments, >= 5 chars each
  /(?<![A-Za-z0-9_.-])eyJ[A-Za-z0-9_-]{2,}\.eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{5,}(?![A-Za-z0-9_-])/g,
];
/** (d) generic high-entropy run. */
const GENERIC_TOKEN_RE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}/g;
const isGenericToken: Validate = (s) =>
  /[A-Z]/.test(s) && /[a-z]/.test(s) && countMatching(s, /[0-9]/) >= 4;

export function detectTokens(text: string): TextMatch[] {
  const out: TextMatch[] = [];
  for (const re of TOKEN_RES) scan("token", text, re, undefined, out);
  scan("token", text, GENERIC_TOKEN_RE, isGenericToken, out);
  return mergeMatches(out);
}

// ---------------------------------------------------------------------------------------------
// account

const ACCOUNT_PREFIXED_RE =
  /(?<![A-Za-z0-9_])(?:cus|acct|sub|pm|card)_([A-Za-z0-9]{8,})(?![A-Za-z0-9_])/g;
const ACCOUNT_UPPER_RE = /(?<![A-Za-z0-9_-])(?:ACCT|ACC|CUST|CID)-?\d{5,}(?![A-Za-z0-9_-])/g;
const isAccountBody: Validate = (s) => {
  const body = s.slice(s.indexOf("_") + 1);
  return countMatching(body, /[0-9]/) >= 2 && /[A-Za-z]/.test(body);
};

export function detectAccountIds(text: string): TextMatch[] {
  const out: TextMatch[] = [];
  scan("account", text, ACCOUNT_PREFIXED_RE, isAccountBody, out);
  scan("account", text, ACCOUNT_UPPER_RE, undefined, out);
  return mergeMatches(out);
}

// ---------------------------------------------------------------------------------------------
// card

/** First digit 2–6, 13–19 digits, single optional ` `/`-` separators, not touching a digit or `-`. */
const CARD_RE = /(?<![\d-])[2-6](?:[ -]?\d){12,18}(?![\d-])/g;

export function detectCards(text: string): TextMatch[] {
  return mergeMatches(scan("card", text, CARD_RE, (s) => luhnValid(s.replace(/[ -]/g, ""))));
}

// ---------------------------------------------------------------------------------------------

export const DETECTORS: Record<DetectorKind, (text: string) => TextMatch[]> = {
  email: detectEmails,
  phone: detectPhones,
  token: detectTokens,
  account: detectAccountIds,
  card: detectCards,
};

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const priority = (k: DetectorKind): number => KIND_PRIORITY.indexOf(k);

export function mergeMatches(matches: readonly TextMatch[]): TextMatch[] {
  const sorted = [...matches].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const out: TextMatch[] = [];
  let group: { start: number; end: number; best: TextMatch } | null = null;
  const flush = () => {
    if (group) out.push({ kind: group.best.kind, start: group.start, end: group.end });
  };
  for (const m of sorted) {
    if (group && m.start < group.end) {
      group.end = Math.max(group.end, m.end);
      const len = m.end - m.start;
      const bestLen = group.best.end - group.best.start;
      if (len > bestLen || (len === bestLen && priority(m.kind) < priority(group.best.kind))) {
        group.best = m;
      }
    } else {
      flush();
      group = { start: m.start, end: m.end, best: m };
    }
  }
  flush();
  return out;
}

export function detect(text: string, kinds: readonly DetectorKind[] = DETECTOR_KINDS): TextMatch[] {
  const all: TextMatch[] = [];
  for (const k of kinds) all.push(...DETECTORS[k](text));
  return mergeMatches(all);
}

export function partialRange(
  match: { start: number; end: number },
  keep: number = PARTIAL_KEEP,
): { start: number; end: number } {
  const len = match.end - match.start;
  if (len < 2 * keep) return { start: match.start, end: match.end };
  return { start: match.start, end: match.end - keep };
}
