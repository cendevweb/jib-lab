import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/demo/Dashboard";
import {
  API_KEYS,
  APP_VERSION,
  BILLING,
  COMPANY,
  CUSTOMERS,
  EXPECTED_TARGETS,
  EXPECTED_TARGETS_WITH_TICKET,
  INBOX,
  KPIS,
  NEW_TICKET,
  TODAY,
} from "@/demo/data";

afterEach(cleanup);

const CUSTOMER_ROWS = [
  ["Maya Chen", "maya.chen@example.com", "+1 (415) 555-0132", "cus_Q8f3LmN2xZ7p", "Pro", "$490"],
  [
    "Tomás Ortega",
    "tomas.ortega@example.org",
    "+44 20 7946 0958",
    "cus_Tb3Nc8Wd1Fe5",
    "Team",
    "$1,250",
  ],
  [
    "Aiko Tanaka",
    "aiko@tanaka-design.example",
    "(212) 555-0187",
    "cus_7Hn2Wq9Rt4Kd",
    "Starter",
    "$49",
  ],
  [
    "Priya Raman",
    "priya.r@example.net",
    "+1 646 555 0199",
    "cus_Zp4Lx8Vb2Nm6",
    "Enterprise",
    "$4,800",
  ],
  ["Jonas Weber", "j.weber@example.com", "+1-312-555-0110", "cus_Rt5Yh7Uj3Ki9", "Pro", "$490"],
] as const;

const FIELDS = ["name", "email", "phone", "id", "plan", "mrr"] as const;

const KPI_ROWS = [
  { testId: "kpi-mrr", label: "MRR", value: "$48,210" },
  { testId: "kpi-customers", label: "Active customers", value: "1,284" },
  { testId: "kpi-churn", label: "Churn (30d)", value: "2.1%" },
  { testId: "kpi-nps", label: "NPS", value: "61" },
];

const BILLING_SPANS: Record<string, string> = {
  "billing-card-number": "4242 4242 4242 4242",
  "billing-expiry": "12/28",
  "billing-email": "billing@acme-corp.example",
  "billing-account-id": "acct_1Nv0FGQ9RKHgCVdK",
  "billing-address": "221B Baker Street, London NW1 6XE",
  "billing-note": "Renewal: 18% discount approved by CFO",
  "billing-plan": "Enterprise · annual",
};

const KEY_ROWS = [
  {
    testId: "api-key-live",
    label: "Production secret key",
    value: "ac_live_7Hq2Kx9LmP4vT8sW3nB6yR1c",
    lastUsed: "2 min ago",
  },
  {
    testId: "api-key-test",
    label: "Test secret key",
    value: "ac_test_4fG8hJ2kL6mN0pQ3rS5tU7vW",
    lastUsed: "1 h ago",
  },
  {
    testId: "api-key-jwt",
    label: "Service JWT",
    value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vLXVzZXIifQ.x7Rk2Lq9Vt4Wm8Ny3Pb6Hs1Z",
    lastUsed: "yesterday",
  },
  {
    testId: "api-key-generic",
    label: "Webhook signing secret",
    value: "Qm9X4tR7pL2vK8sN3wY6hB1dF5gJ0cZe",
    lastUsed: "3 days ago",
  },
];

const INBOX_ROWS = [
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
    body: "Rotated our key, the old one was ac_test_9Zx8Cv7Bn6Mm5Ll4Kk3Jj2Hh — please revoke it.",
  },
  {
    from: "digest@acme-corp.example",
    subject: "Weekly digest",
    received: "07:00",
    body: "Weekly digest: 3 tickets closed, median response 2h 14m, CSAT 96%.",
  },
];

const TICKET = {
  from: "leo.martin@example.com",
  subject: "Update billing contact",
  received: "09:31",
  body: "Please move billing to leo.martin@example.com and call +1 (628) 555-0144 after 3pm.",
};

const text = (testId: string) => screen.getByTestId(testId).textContent;

describe("demo data", () => {
  it("[AC-12] exports the normative fake data and expected counts", () => {
    expect(COMPANY).toBe("Acme Cloud");
    expect(TODAY).toBe("2026-09-26");
    expect(APP_VERSION).toBe("v2.14.3");
    expect(EXPECTED_TARGETS).toBe(35);
    expect(EXPECTED_TARGETS_WITH_TICKET).toBe(38);
    expect(CUSTOMERS).toEqual(
      CUSTOMER_ROWS.map(([name, email, phone, id, plan, mrr]) => ({
        name,
        email,
        phone,
        id,
        plan,
        mrr,
      })),
    );
    expect(KPIS).toEqual(KPI_ROWS);
    expect(BILLING).toEqual({
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/28",
      email: "billing@acme-corp.example",
      accountId: "acct_1Nv0FGQ9RKHgCVdK",
      address: "221B Baker Street, London NW1 6XE",
      note: "Renewal: 18% discount approved by CFO",
      plan: "Enterprise · annual",
    });
    expect(API_KEYS).toEqual(KEY_ROWS);
    expect(INBOX).toEqual(INBOX_ROWS);
    expect(NEW_TICKET).toEqual(TICKET);
  });
});

describe("<Dashboard>", () => {
  it("[AC-12] renders header and KPI testids with the normative values", () => {
    render(<Dashboard ticket={false} onAddTicket={() => {}} />);
    expect(text("today-date")).toContain("2026-09-26");
    expect(text("app-version")).toContain("v2.14.3");
    expect(document.body.textContent).toContain("Acme Cloud");
    for (const k of KPI_ROWS) {
      expect(text(k.testId), k.testId).toContain(k.value);
    }
  });

  it("[AC-12] renders every customer value span with the exact string", () => {
    render(<Dashboard ticket={false} onAddTicket={() => {}} />);
    CUSTOMER_ROWS.forEach((row, i) => {
      expect(screen.getByTestId(`customer-row-${i}`)).toBeTruthy();
      FIELDS.forEach((field, f) => {
        expect(text(`customer-${field}-${i}`), `customer-${field}-${i}`).toBe(row[f]);
      });
    });
    expect(text("customer-email-1")).toBe("tomas.ortega@example.org");
    expect(screen.queryByTestId("customer-row-5")).toBeNull();
  });

  it("[AC-12] renders billing, API keys and inbox value spans with the exact strings", () => {
    render(<Dashboard ticket={false} onAddTicket={() => {}} />);
    expect(screen.getByTestId("billing-card")).toBeTruthy();
    for (const [id, value] of Object.entries(BILLING_SPANS)) expect(text(id), id).toBe(value);
    expect(screen.getByTestId("api-keys-card")).toBeTruthy();
    for (const k of KEY_ROWS) {
      expect(text(k.testId), k.testId).toBe(k.value);
      expect(screen.getByTestId("api-keys-card").textContent).toContain(k.label);
    }
    expect(screen.getByTestId("inbox-card")).toBeTruthy();
    INBOX_ROWS.forEach((m, i) => {
      expect(screen.getByTestId(`inbox-message-${i}`)).toBeTruthy();
      expect(text(`inbox-from-${i}`)).toBe(m.from);
      expect(text(`inbox-subject-${i}`)).toBe(m.subject);
      expect(text(`inbox-body-${i}`)).toBe(m.body);
    });
    expect(screen.queryByTestId("inbox-message-3")).toBeNull();
  });

  it("[AC-12] data-sensitive marks names, address and note only (not detected values)", () => {
    render(<Dashboard ticket={false} onAddTicket={() => {}} />);
    const marked = [
      ...CUSTOMER_ROWS.map((_, i) => `customer-name-${i}`),
      "billing-address",
      "billing-note",
    ];
    for (const id of marked) {
      expect(screen.getByTestId(id).hasAttribute("data-sensitive"), id).toBe(true);
    }
    const detected = [
      ...CUSTOMER_ROWS.flatMap((_, i) => [
        `customer-email-${i}`,
        `customer-phone-${i}`,
        `customer-id-${i}`,
      ]),
      "billing-card-number",
      "billing-email",
      "billing-account-id",
      ...KEY_ROWS.map((k) => k.testId),
      ...INBOX_ROWS.flatMap((_, i) => [`inbox-from-${i}`, `inbox-body-${i}`]),
    ];
    for (const id of detected) {
      expect(screen.getByTestId(id).closest("[data-sensitive]"), id).toBeNull();
      expect(screen.getByTestId(id).closest("[data-privacy-ignore]"), id).toBeNull();
    }
    expect(document.querySelectorAll("[data-sensitive]")).toHaveLength(7);
  });

  it("[AC-12] every value span holds a single text node", () => {
    render(<Dashboard ticket={true} onAddTicket={() => {}} />);
    const ids = [
      ...CUSTOMER_ROWS.flatMap((_, i) => FIELDS.map((f) => `customer-${f}-${i}`)),
      ...Object.keys(BILLING_SPANS),
      ...KEY_ROWS.map((k) => k.testId),
      ...[0, 1, 2, 3].flatMap((i) => [`inbox-from-${i}`, `inbox-body-${i}`]),
    ];
    for (const id of ids) {
      const nodes = [...screen.getByTestId(id).childNodes];
      expect(nodes.length, id).toBe(1);
      expect(nodes[0]?.nodeType, id).toBe(Node.TEXT_NODE);
    }
  });

  it("[AC-12] inbox-add is enabled and calls onAddTicket", () => {
    const onAddTicket = vi.fn();
    render(<Dashboard ticket={false} onAddTicket={onAddTicket} />);
    const add = screen.getByTestId("inbox-add") as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    expect(add.textContent).toContain("Simulate incoming ticket");
    fireEvent.click(add);
    expect(onAddTicket).toHaveBeenCalledTimes(1);
  });

  it("[AC-12] with ticket=true message 3 shows NEW_TICKET and inbox-add is disabled", () => {
    const onAddTicket = vi.fn();
    render(<Dashboard ticket={true} onAddTicket={onAddTicket} />);
    expect(screen.getByTestId("inbox-message-3")).toBeTruthy();
    expect(text("inbox-from-3")).toBe(TICKET.from);
    expect(text("inbox-subject-3")).toBe(TICKET.subject);
    expect(text("inbox-body-3")).toBe(TICKET.body);
    INBOX_ROWS.forEach((m, i) => {
      expect(text(`inbox-body-${i}`)).toBe(m.body);
    });
    const add = screen.getByTestId("inbox-add") as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(onAddTicket).not.toHaveBeenCalled();
  });
});
