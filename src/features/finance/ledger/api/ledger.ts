// General Ledger API (backend: modules/finance/general-ledger, mounted at /api/gl). Amounts arrive as integer
// kobo (or the presentation currency's minor unit) and are formatted here, never added up as floats.
import { useQuery } from "@tanstack/react-query";
import { api, openApiFile } from "@/shared/api/client";

export type GlPermission =
  | "gl.view" | "gl.journal.create" | "gl.journal.approve" | "gl.journal.reverse" | "gl.settings" | "gl.fx" | "gl.sync" | "gl.close" | "gl.mgmt.prepare" | "gl.mgmt.finalise" | "gl.budget" | "gl.roles";

/** The caller's accounting permissions (admins hold all). Used for the nav and to hide buttons; the API decides. */
export function useGlAccess(enabled = true) {
  const query = useQuery({
    queryKey: ["gl", "me"],
    queryFn: () => api.get<{ permissions: GlPermission[]; roles: string[] }>("/api/gl/me"),
    staleTime: 60_000,
    enabled,
    retry: false,
  });
  const can = (p: GlPermission) => Boolean(query.data?.permissions.includes(p));
  return { isLoading: query.isLoading, can, hasAny: Boolean(query.data?.permissions.length) };
}

export const GL_TABS = [
  { to: "/ledger", label: "Overview", end: true },
  { to: "/ledger/dashboard", label: "Dashboard" },
  { to: "/ledger/management-accounts", label: "Management Accounts" },
  { to: "/ledger/budgets", label: "Budgets" },
  { to: "/ledger/commission-transfer", label: "Commission Transfer" },
  { to: "/ledger/journals", label: "Journals" },
  { to: "/ledger/trial-balance", label: "Trial Balance" },
  { to: "/ledger/profit-and-loss", label: "Profit or Loss" },
  { to: "/ledger/balance-sheet", label: "Balance Sheet" },
  { to: "/ledger/commission-tracking", label: "Commission Tracking" },
  { to: "/ledger/year-end", label: "Year-End Close" },
  { to: "/ledger/settings", label: "Ledger Settings" },
];

const SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

/** 123456 -> "₦1,234.56". Negative figures in brackets, the accountants' way. */
export function fmtMinor(minor: number | null | undefined, currency = "NGN", { brackets = true } = {}): string {
  const n = Number(minor) || 0;
  const text = `${SYMBOL[currency] ?? `${currency} `}${(Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n < 0) return brackets ? `(${text})` : `-${text}`;
  return text;
}

/** Blank for zero: Dr/Cr columns read better with gaps. */
export const fmtMinorOrBlank = (minor: number, currency = "NGN") => (minor ? fmtMinor(minor, currency) : "");

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  classification: string;
}

export function usePostingAccounts() {
  return useQuery({ queryKey: ["gl", "accounts"], queryFn: () => api.get<{ accounts: Account[] }>("/api/gl/accounts"), staleTime: 60_000 });
}

export interface JournalRow {
  id: number;
  journal_no: string | null;
  journal_date: string;
  description: string;
  kind: "manual" | "opening" | "system" | "reversal";
  status: "Draft" | "Posted" | "Rejected";
  currency: string;
  total_cents: number;
  source_type: string | null;
  source_id: number | null;
  reversed_by_id: number | null;
  reversal_of_id: number | null;
  created_by: string | null;
  approved_by: string | null;
  sourceLink: string | null;
}

export interface JournalLine {
  id: number;
  lineNo: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  classification: string;
  debitCents: number;
  creditCents: number;
  currency: string;
  foreignDebitMinor: number;
  foreignCreditMinor: number;
  memo: string | null;
  clientId: number | null;
  clientName: string | null;
  insurerId: number | null;
  insurerName: string | null;
  transactionId: number | null;
}

export interface JournalDetail extends JournalRow {
  fx_rate_micro: number;
  fx_rate_date: string | null;
  reason: string | null;
  posted_at: string | null;
  created_at: string;
  reversalOf: { id: number; journal_no: string } | null;
  reversedBy: { id: number; journal_no: string } | null;
  lines: JournalLine[];
}

export const KIND_LABEL: Record<JournalRow["kind"], string> = {
  manual: "Manual", opening: "Opening balances", system: "Automatic", reversal: "Reversal",
};

export const SOURCE_LABEL: Record<string, string> = {
  receipt: "Receipt", remittance: "Insurer remittance", settlement: "Insurer settlement", commission_statement: "Commission statement",
  producer_payable: "Producer payable", expense: "Expense", investment_income: "Investment income", year_close: "Year-end close",
};

/** Downloads a statement as .xlsx or .csv with the same filters as the screen. */
export function downloadReport(path: string, params: Record<string, string>, format: "xlsx" | "csv") {
  const qs = new URLSearchParams({ ...params, format });
  return openApiFile(`${path}?${qs.toString()}`);
}

/** The financial year to date (January to today), the statements' default range. */
export function defaultRange() {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}
