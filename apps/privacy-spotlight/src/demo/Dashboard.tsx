// Fake SaaS admin dashboard (SPEC §4.7). Every value is the sole text node of its own
// `<span data-testid=…>`, so the scanner sees one string per value and React never splits it.
// Only names, the address and the note carry `data-sensitive`; everything else is detected.
import { Panel } from "@jib/ui";
import type { ReactElement, ReactNode } from "react";
import {
  API_KEYS,
  APP_VERSION,
  BILLING,
  COMPANY,
  CUSTOMERS,
  INBOX,
  type InboxMessage,
  KPIS,
  NEW_TICKET,
  TODAY,
} from "./data";
import "./demo.css";

/** Static, non-sensitive decoration (must never match a detector). */
const KPI_TRENDS: Record<string, { text: string; tone: "up" | "down" | "flat" }> = {
  "kpi-mrr": { text: "+6.4% vs August", tone: "up" },
  "kpi-customers": { text: "+38 this month", tone: "up" },
  "kpi-churn": { text: "−0.3 pts vs August", tone: "up" },
  "kpi-nps": { text: "+4 since Q2", tone: "up" },
};

const NAV = ["Overview", "Customers", "Billing", "Developers", "Support"];

const ACTIVITY: { time: string; text: string }[] = [
  { time: "09:02", text: "Plan upgraded from Starter to Team" },
  { time: "08:47", text: "Webhook endpoint updated" },
  { time: "08:30", text: "Monthly invoices sent to all workspaces" },
  { time: "08:12", text: "SSO enforced for the Admin role" },
  { time: "07:41", text: "Payout scheduled: $12,480" },
];

function CardHead({ title, children }: { title: string; children?: ReactNode }): ReactElement {
  return (
    <div className="dash-card-head">
      <h2 className="jib-panel__title dash-card-title">{title}</h2>
      {children}
    </div>
  );
}

function CustomersCard(): ReactElement {
  return (
    <Panel className="dash-card">
      <CardHead title="Customers">
        <span className="dash-muted">Top accounts by MRR</span>
      </CardHead>
      <table className="dash-table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Customer ID</th>
            <th scope="col">Plan</th>
            <th scope="col" className="dash-num">
              MRR
            </th>
          </tr>
        </thead>
        <tbody>
          {CUSTOMERS.map((c, i) => (
            <tr key={c.id} data-testid={`customer-row-${i}`}>
              <td data-label="Customer" className="dash-name">
                <span className="dash-avatar" aria-hidden="true" />
                <span data-testid={`customer-name-${i}`} data-sensitive="name">
                  {c.name}
                </span>
              </td>
              <td data-label="Email">
                <span data-testid={`customer-email-${i}`}>{c.email}</span>
              </td>
              <td data-label="Phone">
                <span data-testid={`customer-phone-${i}`}>{c.phone}</span>
              </td>
              <td data-label="Customer ID" className="dash-mono">
                <span data-testid={`customer-id-${i}`}>{c.id}</span>
              </td>
              <td data-label="Plan">
                <span
                  className="dash-pill"
                  data-plan={c.plan.toLowerCase()}
                  data-testid={`customer-plan-${i}`}
                >
                  {c.plan}
                </span>
              </td>
              <td data-label="MRR" className="dash-num">
                <span data-testid={`customer-mrr-${i}`}>{c.mrr}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Message({
  message,
  index,
  isNew,
}: {
  message: InboxMessage;
  index: number;
  isNew: boolean;
}): ReactElement {
  return (
    <li className="dash-msg" data-testid={`inbox-message-${index}`} data-new={isNew}>
      <div className="dash-msg-head">
        <span className="dash-msg-from" data-testid={`inbox-from-${index}`}>
          {message.from}
        </span>
        {isNew ? <span className="dash-pill dash-pill-new">New</span> : null}
        <span className="dash-msg-time">{message.received}</span>
      </div>
      <div className="dash-msg-subject" data-testid={`inbox-subject-${index}`}>
        {message.subject}
      </div>
      <p className="dash-msg-body">
        <span data-testid={`inbox-body-${index}`}>{message.body}</span>
      </p>
    </li>
  );
}

function InboxCard({
  ticket,
  onAddTicket,
}: {
  ticket: boolean;
  onAddTicket: () => void;
}): ReactElement {
  const count = INBOX.length + (ticket ? 1 : 0);
  return (
    <div data-testid="inbox-card" className="dash-slot">
      <Panel className="dash-card">
        <CardHead title="Support inbox">
          <span className="dash-muted">{count} messages</span>
          <button
            type="button"
            className="jib-btn dash-add"
            data-testid="inbox-add"
            disabled={ticket}
            onClick={onAddTicket}
          >
            Simulate incoming ticket
          </button>
        </CardHead>
        <ul className="dash-inbox">
          {ticket ? <Message message={NEW_TICKET} index={INBOX.length} isNew /> : null}
          {INBOX.map((m, i) => (
            <Message key={m.received} message={m} index={i} isNew={false} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function BillingCard(): ReactElement {
  return (
    <div data-testid="billing-card" className="dash-slot">
      <Panel className="dash-card">
        <CardHead title="Billing">
          <span className="dash-pill" data-plan="enterprise" data-testid="billing-plan">
            {BILLING.plan}
          </span>
        </CardHead>
        <div className="dash-billing">
          <div className="dash-cc">
            <div className="dash-cc-top">
              <span className="dash-cc-chip" aria-hidden="true" />
              <span className="dash-cc-brand">VISA</span>
            </div>
            <div className="dash-cc-number">
              <span data-testid="billing-card-number">{BILLING.cardNumber}</span>
            </div>
            <div className="dash-cc-bottom">
              <span className="dash-cc-caption">Expires</span>
              <span data-testid="billing-expiry">{BILLING.expiry}</span>
            </div>
          </div>
          <dl className="dash-fields">
            <div>
              <dt>Billing email</dt>
              <dd>
                <span data-testid="billing-email">{BILLING.email}</span>
              </dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd className="dash-mono">
                <span data-testid="billing-account-id">{BILLING.accountId}</span>
              </dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>
                <span data-testid="billing-address" data-sensitive="address">
                  {BILLING.address}
                </span>
              </dd>
            </div>
            <div>
              <dt>Internal note</dt>
              <dd>
                <span data-testid="billing-note" data-sensitive="note">
                  {BILLING.note}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </Panel>
    </div>
  );
}

function ApiKeysCard(): ReactElement {
  return (
    <div data-testid="api-keys-card" className="dash-slot">
      <Panel className="dash-card">
        <CardHead title="API keys">
          <span className="dash-muted">{API_KEYS.length} active</span>
        </CardHead>
        <ul className="dash-keys">
          {API_KEYS.map((k) => (
            <li key={k.testId} className="dash-key">
              <div className="dash-key-head">
                <span className="dash-key-label">{k.label}</span>
                <span className="dash-muted">Last used {k.lastUsed}</span>
              </div>
              <code className="dash-key-value">
                <span data-testid={k.testId}>{k.value}</span>
              </code>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function ActivityCard(): ReactElement {
  return (
    <Panel className="dash-card">
      <CardHead title="Recent activity" />
      <ul className="dash-activity">
        {ACTIVITY.map((a) => (
          <li key={a.time}>
            <span className="dash-activity-time">{a.time}</span>
            <span>{a.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Dashboard({
  ticket,
  onAddTicket,
}: {
  ticket: boolean;
  onAddTicket: () => void;
}): ReactElement {
  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-logo" aria-hidden="true" />
          <span>
            <strong>{COMPANY}</strong> · Admin
          </span>
        </div>
        <nav className="dash-nav" aria-label="Dashboard sections">
          {NAV.map((item, i) => (
            <span key={item} className="dash-nav-item" data-active={i === 0}>
              {item}
            </span>
          ))}
        </nav>
        <div className="dash-meta">
          <span data-testid="today-date">{TODAY}</span>
          <span className="dash-version" data-testid="app-version">
            {APP_VERSION}
          </span>
        </div>
      </header>

      <div className="dash-kpis">
        {KPIS.map((k) => {
          const trend = KPI_TRENDS[k.testId];
          return (
            <div key={k.testId} className="dash-kpi">
              <span className="dash-kpi-label">{k.label}</span>
              <span className="dash-kpi-value" data-testid={k.testId}>
                {k.value}
              </span>
              {trend ? (
                <span className="dash-kpi-trend" data-tone={trend.tone}>
                  {trend.text}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <CustomersCard />
          <InboxCard ticket={ticket} onAddTicket={onAddTicket} />
        </div>
        <div className="dash-col">
          <BillingCard />
          <ApiKeysCard />
          <ActivityCard />
        </div>
      </div>
    </div>
  );
}
