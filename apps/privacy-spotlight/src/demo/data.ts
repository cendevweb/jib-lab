// Demo content (SPEC §4.7). Static, deterministic and obviously fake: RFC 2606 domains,
// 555-01xx / Ofcom drama numbers, the Stripe test card and a fictional `ac_` key prefix.
// Token-looking values are assembled from parts so no source literal resembles a real secret
// (push protection / secret scanners). The rendered strings are the normative ones.
export type Customer = {
  name: string;
  email: string;
  phone: string;
  id: string;
  plan: string;
  mrr: string;
};
export type ApiKey = { testId: string; label: string; value: string; lastUsed: string };
export type InboxMessage = { from: string; subject: string; body: string; received: string };

const key = (...parts: string[]): string => parts.join("");

const LIVE_KEY = key("ac", "_live_", "7Hq2Kx9LmP4v", "T8sW3nB6yR1c");
const TEST_KEY = key("ac", "_test_", "4fG8hJ2kL6mN", "0pQ3rS5tU7vW");
const ROTATED_KEY = key("ac", "_test_", "9Zx8Cv7Bn6Mm", "5Ll4Kk3Jj2Hh");
const SERVICE_JWT = [
  key("ey", "JhbGciOiJIUzI1NiJ9"),
  key("ey", "JzdWIiOiJkZW1vLXVzZXIifQ"),
  key("x7Rk2Lq9", "Vt4Wm8Ny3Pb6Hs1Z"),
].join(".");
const WEBHOOK_SECRET = key("Qm9X4tR7pL2vK8sN", "3wY6hB1dF5gJ0cZe");

export const COMPANY: string = "Acme Cloud";
export const TODAY: string = "2026-09-26";
export const APP_VERSION: string = "v2.14.3";

export const KPIS: { testId: string; label: string; value: string }[] = [
  { testId: "kpi-mrr", label: "MRR", value: "$48,210" },
  { testId: "kpi-customers", label: "Active customers", value: "1,284" },
  { testId: "kpi-churn", label: "Churn (30d)", value: "2.1%" },
  { testId: "kpi-nps", label: "NPS", value: "61" },
];

export const CUSTOMERS: Customer[] = [
  {
    name: "Maya Chen",
    email: "maya.chen@example.com",
    phone: "+1 (415) 555-0132",
    id: "cus_Q8f3LmN2xZ7p",
    plan: "Pro",
    mrr: "$490",
  },
  {
    name: "Tomás Ortega",
    email: "tomas.ortega@example.org",
    phone: "+44 20 7946 0958",
    id: "cus_Tb3Nc8Wd1Fe5",
    plan: "Team",
    mrr: "$1,250",
  },
  {
    name: "Aiko Tanaka",
    email: "aiko@tanaka-design.example",
    phone: "(212) 555-0187",
    id: "cus_7Hn2Wq9Rt4Kd",
    plan: "Starter",
    mrr: "$49",
  },
  {
    name: "Priya Raman",
    email: "priya.r@example.net",
    phone: "+1 646 555 0199",
    id: "cus_Zp4Lx8Vb2Nm6",
    plan: "Enterprise",
    mrr: "$4,800",
  },
  {
    name: "Jonas Weber",
    email: "j.weber@example.com",
    phone: "+1-312-555-0110",
    id: "cus_Rt5Yh7Uj3Ki9",
    plan: "Pro",
    mrr: "$490",
  },
];

export const BILLING: {
  cardNumber: string;
  expiry: string;
  email: string;
  accountId: string;
  address: string;
  note: string;
  plan: string;
} = {
  cardNumber: "4242 4242 4242 4242",
  expiry: "12/28",
  email: "billing@acme-corp.example",
  accountId: "acct_1Nv0FGQ9RKHgCVdK",
  address: "221B Baker Street, London NW1 6XE",
  note: "Renewal: 18% discount approved by CFO",
  plan: "Enterprise · annual",
};

export const API_KEYS: ApiKey[] = [
  {
    testId: "api-key-live",
    label: "Production secret key",
    value: LIVE_KEY,
    lastUsed: "2 min ago",
  },
  { testId: "api-key-test", label: "Test secret key", value: TEST_KEY, lastUsed: "1 h ago" },
  { testId: "api-key-jwt", label: "Service JWT", value: SERVICE_JWT, lastUsed: "yesterday" },
  {
    testId: "api-key-generic",
    label: "Webhook signing secret",
    value: WEBHOOK_SECRET,
    lastUsed: "3 days ago",
  },
];

export const INBOX: InboxMessage[] = [
  {
    from: "maya.chen@example.com",
    subject: "Invoices bouncing",
    received: "09:14",
    body: "Hi! Our invoices bounce — can you call me at +1 (415) 555-0132? Account cus_Q8f3LmN2xZ7p.",
  },
  {
    from: "d.kowalski@example.org",
    subject: "Key rotated",
    received: "08:52",
    body: `Rotated our key, the old one was ${ROTATED_KEY} — please revoke it.`,
  },
  {
    from: "digest@acme-corp.example",
    subject: "Weekly digest",
    received: "07:00",
    body: "Weekly digest: 3 tickets closed, median response 2h 14m, CSAT 96%.",
  },
];

export const NEW_TICKET: InboxMessage = {
  from: "leo.martin@example.com",
  subject: "Update billing contact",
  received: "09:31",
  body: "Please move billing to leo.martin@example.com and call +1 (628) 555-0144 after 3pm.",
};

/** Masked values before the ticket. */
export const EXPECTED_TARGETS = 35;
export const EXPECTED_TARGETS_WITH_TICKET = 38;
