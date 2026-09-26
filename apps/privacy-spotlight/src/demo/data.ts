// Contract stub (harness). WP-03 fills in the normative data from SPEC §4.7.
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

export const COMPANY: string = "";
export const TODAY: string = "";
export const APP_VERSION: string = "";
export const KPIS: { testId: string; label: string; value: string }[] = [];
export const CUSTOMERS: Customer[] = [];
export const BILLING: {
  cardNumber: string;
  expiry: string;
  email: string;
  accountId: string;
  address: string;
  note: string;
  plan: string;
} = { cardNumber: "", expiry: "", email: "", accountId: "", address: "", note: "", plan: "" };
export const API_KEYS: ApiKey[] = [];
export const INBOX: InboxMessage[] = [];
export const NEW_TICKET: InboxMessage = { from: "", subject: "", body: "", received: "" };
/** Masked values before the ticket. */
export const EXPECTED_TARGETS = 35;
export const EXPECTED_TARGETS_WITH_TICKET = 38;
