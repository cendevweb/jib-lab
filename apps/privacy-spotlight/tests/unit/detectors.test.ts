import { describe, expect, it } from "vitest";
import { DETECTOR_KINDS, KIND_PRIORITY } from "@/core/constants";
import {
  DETECTORS,
  detect,
  detectAccountIds,
  detectCards,
  detectEmails,
  detectPhones,
  detectTokens,
  luhnValid,
  mergeMatches,
  partialRange,
} from "@/core/detectors";
import type { DetectorKind, TextMatch } from "@/core/types";

/**
 * Vendor-prefixed fixtures are built by concatenation (SPEC §3) so that no literal in this file
 * matches a secret-scanner / push-protection pattern. Bodies are low-entropy repeats.
 */
const cat = (...parts: string[]) => parts.join("");
const GITHUB_PAT_FIXTURE = cat("gh", "p_", "x9Y8".repeat(9)); // prefix + 36 alnum
const AWS_KEY_ID_FIXTURE = cat("AK", "IA", "Q7X2".repeat(4)); // prefix + 16 [0-9A-Z]
const STRIPE_STYLE_FIXTURE = cat("sk", "_li", "ve_", "a1B2c3D4".repeat(3)); // [a-z]{2,8}_live_ + 24

const whole = (kind: DetectorKind, s: string): TextMatch[] => [{ kind, start: 0, end: s.length }];

const MUST_MATCH: Record<DetectorKind, string[]> = {
  email: [
    "maya.chen@example.com",
    "tomas.ortega@example.org",
    "aiko@tanaka-design.example",
    "billing@acme-corp.example",
  ],
  phone: [
    "+1 (415) 555-0132",
    "+44 20 7946 0958",
    "(212) 555-0187",
    "+1 646 555 0199",
    "+1-312-555-0110",
    "212.555.0187",
  ],
  token: [
    "ac_live_7Hq2Kx9LmP4vT8sW3nB6yR1c",
    "ac_test_4fG8hJ2kL6mN0pQ3rS5tU7vW",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vLXVzZXIifQ.x7Rk2Lq9Vt4Wm8Ny3Pb6Hs1Z",
    "Qm9X4tR7pL2vK8sN3wY6hB1dF5gJ0cZe",
    GITHUB_PAT_FIXTURE,
    AWS_KEY_ID_FIXTURE,
    STRIPE_STYLE_FIXTURE,
  ],
  account: ["cus_Q8f3LmN2xZ7p", "acct_1Nv0FGQ9RKHgCVdK", "ACCT-0048213", "CUST-100245"],
  card: ["4242 4242 4242 4242", "4242424242424242", "5555 5555 5555 4444", "3782 822463 10005"],
};

const SINGLE_DETECTOR: Record<DetectorKind, (text: string) => TextMatch[]> = {
  email: detectEmails,
  phone: detectPhones,
  token: detectTokens,
  account: detectAccountIds,
  card: detectCards,
};

/** Email/phone-looking negatives (AC-01). */
const MUST_NOT_MATCH_CONTACT = [
  "@maya",
  "user@localhost",
  "a@b.c",
  "ada at example dot com",
  "2026-09-26",
  "v2.14.3",
  "192.168.0.1",
  "555-0132",
  "+15% growth",
  "20260926",
  "$48,210",
];

/** Remaining negatives (AC-02). */
const MUST_NOT_MATCH_OTHER = [
  "1,284",
  "2.1%",
  "Order #10442",
  "3f1c9a2e-7b4d-4e8a-9c6f-1a2b3c4d5e6f",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "getUserAccountSettingsHandlerV2",
  "sk_live_short",
  "the_live_show",
  "in_progress",
  "sub_category1",
  "cus_short",
  "discus_1234567890",
  "ACC-12",
  "4242 4242 4242 4241",
  "1727344800000",
  "2026 0926 1200",
  "Weekly digest: 3 tickets closed, median response 2h 14m, CSAT 96%.",
];

function expectSortedNonOverlapping(matches: readonly TextMatch[]) {
  matches.slice(1).forEach((m, i) => {
    expect(m.start).toBeGreaterThanOrEqual((matches[i] as TextMatch).end);
  });
}

describe("email + phone detectors", () => {
  for (const kind of ["email", "phone"] as const) {
    for (const s of MUST_MATCH[kind]) {
      it(`[AC-01] ${kind} detector matches ${JSON.stringify(s)} as one whole-string match`, () => {
        expect(SINGLE_DETECTOR[kind](s)).toEqual(whole(kind, s));
        expect(detect(s)).toEqual(whole(kind, s));
      });
    }
  }

  it("[AC-01] a sentence-final dot is not part of the email", () => {
    expect(detectEmails("Mail maya@example.com.")).toEqual([{ kind: "email", start: 5, end: 21 }]);
    expect(detect("Mail maya@example.com.")).toEqual([{ kind: "email", start: 5, end: 21 }]);
  });

  for (const s of MUST_NOT_MATCH_CONTACT) {
    it(`[AC-01] does not match ${JSON.stringify(s)}`, () => {
      expect(detectEmails(s)).toEqual([]);
      expect(detectPhones(s)).toEqual([]);
      expect(detect(s)).toEqual([]);
    });
  }

  it("[AC-01] finds several emails in one string, sorted, and is stable across calls", () => {
    const s = "a.one@example.com, b.two@example.org; c.three@example.net";
    const first = detectEmails(s);
    expect(first).toEqual([
      { kind: "email", start: 0, end: 17 },
      { kind: "email", start: 19, end: 36 },
      { kind: "email", start: 38, end: 57 },
    ]);
    // No shared regex state (lastIndex) between calls.
    expect(detectEmails(s)).toEqual(first);
    expect(detectEmails("x maya@example.com")).toEqual([{ kind: "email", start: 2, end: 18 }]);
    expect(detectPhones("call (212) 555-0187 or 212.555.0187")).toEqual([
      { kind: "phone", start: 5, end: 19 },
      { kind: "phone", start: 23, end: 35 },
    ]);
    expect(detectPhones("call (212) 555-0187 or 212.555.0187")).toEqual([
      { kind: "phone", start: 5, end: 19 },
      { kind: "phone", start: 23, end: 35 },
    ]);
  });
});

describe("token, account and card detectors", () => {
  for (const kind of ["token", "account", "card"] as const) {
    for (const s of MUST_MATCH[kind]) {
      const vendor = [GITHUB_PAT_FIXTURE, AWS_KEY_ID_FIXTURE, STRIPE_STYLE_FIXTURE].includes(s);
      const shown = vendor ? "concatenated vendor fixture" : s;
      it(`[AC-02] ${kind} detector matches ${JSON.stringify(shown)} as one whole-string match`, () => {
        expect(SINGLE_DETECTOR[kind](s)).toEqual(whole(kind, s));
        expect(detect(s)).toEqual(whole(kind, s));
      });
    }
  }

  for (const s of MUST_NOT_MATCH_OTHER) {
    it(`[AC-02] detect(${JSON.stringify(s)}) is empty`, () => {
      expect(detect(s)).toEqual([]);
    });
  }

  it("[AC-02] luhnValid follows the standard algorithm and rejects empty / non-digit input", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("378282246310005")).toBe(true);
    expect(luhnValid("79927398713")).toBe(true);
    expect(luhnValid("5555555555554444")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
    expect(luhnValid("")).toBe(false);
    expect(luhnValid("42a2")).toBe(false);
  });

  it("[AC-02] DETECTORS has exactly the 5 keys of DETECTOR_KINDS and maps to the detectors", () => {
    expect(Object.keys(DETECTORS).sort()).toEqual([...DETECTOR_KINDS].sort());
    expect(DETECTOR_KINDS).toEqual(["email", "phone", "token", "account", "card"]);
    for (const kind of DETECTOR_KINDS) {
      for (const s of MUST_MATCH[kind]) expect(DETECTORS[kind](s)).toEqual(whole(kind, s));
    }
  });
});

describe("detect / mergeMatches / partialRange", () => {
  it("[AC-03] prose samples return exactly the listed matches", () => {
    expect(detect("Mail maya.chen@example.com or call +1 (415) 555-0132.")).toEqual([
      { kind: "email", start: 5, end: 26 },
      { kind: "phone", start: 35, end: 52 },
    ]);
    expect(
      detect(
        "Hi! Our invoices bounce — can you call me at +1 (415) 555-0132? Account cus_Q8f3LmN2xZ7p.",
      ),
    ).toEqual([
      { kind: "phone", start: 45, end: 62 },
      { kind: "account", start: 72, end: 88 },
    ]);
    expect(
      detect(
        "Rotated our key, the old one was ac_test_9Zx8Cv7Bn6Mm5Ll4Kk3Jj2Hh — please revoke it.",
      ),
    ).toEqual([{ kind: "token", start: 33, end: 65 }]);
    expect(
      detect("Please move billing to leo.martin@example.com and call +1 (628) 555-0144 after 3pm."),
    ).toEqual([
      { kind: "email", start: 23, end: 45 },
      { kind: "phone", start: 55, end: 72 },
    ]);
  });

  it("[AC-03] a generic token inside a longer email merges into one email match", () => {
    const s = "Qm9X4tR7pL2vK8sN3wY6hB1dF5gJ0cZe@example.com";
    expect(detect(s)).toEqual([{ kind: "email", start: 0, end: 44 }]);
    expect(detectTokens(s)).toEqual([{ kind: "token", start: 0, end: 32 }]);
  });

  it("[AC-03] detect(s, kinds) only runs the listed detectors", () => {
    const s = "maya@example.com +1 (415) 555-0132";
    expect(detect(s, ["phone"])).toEqual([{ kind: "phone", start: 17, end: 34 }]);
    expect(detect(s, ["email"])).toEqual([{ kind: "email", start: 0, end: 16 }]);
    expect(detect(s, [])).toEqual([]);
    expect(detect(s)).toEqual([
      { kind: "email", start: 0, end: 16 },
      { kind: "phone", start: 17, end: 34 },
    ]);
  });

  it("[AC-03] detect output is sorted and non-overlapping on the dashboard prose", () => {
    const text =
      "Mail maya.chen@example.com or call +1 (415) 555-0132. Card 4242 4242 4242 4242, id acct_1Nv0FGQ9RKHgCVdK, key ac_live_7Hq2Kx9LmP4vT8sW3nB6yR1c.";
    const out = detect(text);
    expect(out.map((m) => m.kind)).toEqual(["email", "phone", "card", "account", "token"]);
    expectSortedNonOverlapping(out);
  });

  it("[AC-03] mergeMatches groups overlapping ranges to {min start, max end} with the longest kind", () => {
    expect(
      mergeMatches([
        { kind: "email", start: 0, end: 10 },
        { kind: "token", start: 5, end: 20 },
      ]),
    ).toEqual([{ kind: "token", start: 0, end: 20 }]);
    // containment
    expect(
      mergeMatches([
        { kind: "phone", start: 2, end: 5 },
        { kind: "email", start: 0, end: 20 },
      ]),
    ).toEqual([{ kind: "email", start: 0, end: 20 }]);
    // transitive chain: A overlaps B, B overlaps C, A does not overlap C
    expect(
      mergeMatches([
        { kind: "phone", start: 9, end: 12 },
        { kind: "email", start: 0, end: 5 },
        { kind: "account", start: 4, end: 10 },
      ]),
    ).toEqual([{ kind: "account", start: 0, end: 12 }]);
  });

  it("[AC-03] mergeMatches breaks length ties with KIND_PRIORITY", () => {
    expect(KIND_PRIORITY).toEqual(["token", "card", "email", "account", "phone"]);
    expect(
      mergeMatches([
        { kind: "phone", start: 0, end: 10 },
        { kind: "token", start: 5, end: 15 },
      ]),
    ).toEqual([{ kind: "token", start: 0, end: 15 }]);
    expect(
      mergeMatches([
        { kind: "account", start: 0, end: 10 },
        { kind: "email", start: 5, end: 15 },
      ]),
    ).toEqual([{ kind: "email", start: 0, end: 15 }]);
    expect(
      mergeMatches([
        { kind: "phone", start: 3, end: 13 },
        { kind: "card", start: 0, end: 10 },
      ]),
    ).toEqual([{ kind: "card", start: 0, end: 13 }]);
  });

  it("[AC-03] mergeMatches collapses duplicates, keeps adjacent ranges apart and sorts by start", () => {
    expect(
      mergeMatches([
        { kind: "email", start: 0, end: 5 },
        { kind: "email", start: 0, end: 5 },
      ]),
    ).toEqual([{ kind: "email", start: 0, end: 5 }]);
    expect(
      mergeMatches([
        { kind: "phone", start: 5, end: 10 },
        { kind: "email", start: 0, end: 5 },
      ]),
    ).toEqual([
      { kind: "email", start: 0, end: 5 },
      { kind: "phone", start: 5, end: 10 },
    ]);
    expect(
      mergeMatches([
        { kind: "card", start: 30, end: 40 },
        { kind: "token", start: 12, end: 20 },
        { kind: "email", start: 0, end: 4 },
      ]),
    ).toEqual([
      { kind: "email", start: 0, end: 4 },
      { kind: "token", start: 12, end: 20 },
      { kind: "card", start: 30, end: 40 },
    ]);
    expect(mergeMatches([])).toEqual([]);
  });

  it("[AC-03] mergeMatches does not mutate its input", () => {
    const input: TextMatch[] = [
      { kind: "token", start: 5, end: 20 },
      { kind: "email", start: 0, end: 10 },
      { kind: "phone", start: 30, end: 35 },
    ];
    const snapshot = structuredClone(input);
    for (const m of input) Object.freeze(m);
    Object.freeze(input);
    const out = mergeMatches(input);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
  });

  it("[AC-03] partialRange keeps the last `keep` chars and masks short values fully", () => {
    expect(partialRange({ start: 0, end: 19 })).toEqual({ start: 0, end: 15 });
    expect(partialRange({ start: 5, end: 26 })).toEqual({ start: 5, end: 22 });
    expect(partialRange({ start: 0, end: 7 })).toEqual({ start: 0, end: 7 });
    expect(partialRange({ start: 0, end: 8 })).toEqual({ start: 0, end: 4 });
    expect(partialRange({ start: 0, end: 10 }, 2)).toEqual({ start: 0, end: 8 });
    expect(partialRange({ start: 3, end: 6 }, 2)).toEqual({ start: 3, end: 6 });
  });
});
