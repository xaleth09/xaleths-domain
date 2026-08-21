// zenny/v1 — data contract for the Zenny financial console.
// Spec: yggdrasil members/robbi/projects/xaleths-domain/2026-08-18-zenny-financial-dashboard/
// public/private/zenny-data.json is the single source of truth.
//
// PRIVACY: real data lives here by Robbi's explicit 2026-08-18 ruling (see the
// zenny workstream in yggdrasil) — intentional, not an incident.

export type AccountKind = 'cc' | 'loan' | 'student' | 'auto';

export type BillAmount =
  | { type: 'fixed'; value: number }
  | { type: 'range'; min: number; max: number }
  // e.g. "whatever cash is left"; defaultValue is the planned amount used for
  // period math until an actual amount is entered for the cycle.
  | { type: 'flex'; note: string; defaultValue?: number };

export interface Paycheck {
  id: string; // e.g. "P-15"
  day: number; // day of month it lands
  net: number; // what actually hits the bank
}

export interface Bill {
  id: string;
  name: string;
  amount: BillAmount;
  dueDay: number;
  autopay: boolean;
  /** Which paycheck funds this bill — Robbi's assignment, never derived from dueDay. */
  period: string; // Paycheck id
  accountId?: string | null; // linked debt account (CC payment → its balance)
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  apr: number | null; // null = not yet provided
  autopay: boolean;
  minPayment: number | null;
  /** Balance snapshots, oldest first. The burndown chart is this history. */
  history: { date: string; balance: number }[];
}

export interface VestEvent {
  date: string; // ISO
  shares: number;
  pct: number;
  plan?: string;
}

export interface EquityGrant {
  id: string;
  employer: string;
  ticker: string;
  totalShares: number;
  vests: VestEvent[];
  note?: string;
}

export interface ZennyData {
  schema: 'zenny/v1';
  updated: string;
  /** true → the page renders a DEMO banner and treats every number as fake. */
  demo: boolean;
  note?: string;
  income: {
    grossAnnual: number | null;
    paychecks: Paycheck[];
  };
  bills: Bill[];
  /**
   * Paid state per PAY CYCLE, not per calendar month. Keys are
   * `${paycheckId}:${cycleStartISO}` (e.g. "P-31:2026-08-31") — a period's
   * cycle starts on its payday and its bills reset then.
   */
  paidLog: Record<string, string[]>;
  accounts: Account[];
  equity: {
    grants: EquityGrant[];
    /** Manual price entry — no market feed in Phase 1. */
    price: { value: number; asOf: string; source: string } | null;
    /** Estimated combined withholding on vest, 0–1. An estimate, not tax advice. */
    withholdingPct: number;
  };
  savings: {
    balance: number | null;
    target: number | null;
    history: { date: string; balance: number }[];
  };
}

export function billAmountValue(a: BillAmount): { display: string; mid: number | null } {
  switch (a.type) {
    case 'fixed':
      return { display: `$${a.value.toLocaleString()}`, mid: a.value };
    case 'range':
      return { display: `$${a.min.toLocaleString()}–$${a.max.toLocaleString()}`, mid: (a.min + a.max) / 2 };
    case 'flex':
      return { display: a.note, mid: null };
  }
}

export function currentBalance(acc: Account): number | null {
  return acc.history.length ? acc.history[acc.history.length - 1].balance : null;
}

export function validateZenny(raw: unknown): { data: ZennyData | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { data: null, errors: ['Root is not an object.'] };
  const d = raw as Record<string, unknown>;
  if (d.schema !== 'zenny/v1') errors.push(`schema is ${JSON.stringify(d.schema)} — expected "zenny/v1".`);
  const income = d.income as Record<string, unknown> | undefined;
  if (!income || !Array.isArray(income.paychecks)) errors.push('income.paychecks is not an array.');
  if (!Array.isArray(d.bills)) errors.push('bills is not an array.');
  if (typeof d.paidLog !== 'object' || d.paidLog === null) errors.push('paidLog is not an object.');
  if (!Array.isArray(d.accounts)) errors.push('accounts is not an array.');
  const equity = d.equity as Record<string, unknown> | undefined;
  if (!equity || !Array.isArray(equity.grants)) errors.push('equity.grants is not an array.');
  if (Array.isArray(d.bills) && Array.isArray(income?.paychecks)) {
    const pids = new Set((income!.paychecks as { id?: string }[]).map(p => String(p.id)));
    for (const b of d.bills as Record<string, unknown>[]) {
      if (!b.id || !b.name) errors.push(`bill ${JSON.stringify(b.id ?? '?')} missing id/name.`);
      if (!pids.has(String(b.period))) errors.push(`bill ${JSON.stringify(b.id ?? '?')} has unknown period ${JSON.stringify(b.period)}.`);
    }
  }
  return errors.length ? { data: null, errors } : { data: raw as ZennyData, errors: [] };
}
