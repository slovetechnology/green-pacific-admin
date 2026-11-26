import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// Shapes returned by /api/sub-brokers (backend routes/subBrokers.js).
export interface SubBroker {
  id: number;
  reference_no: string;
  type: "Individual" | "Corporate";
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  rc_number: string | null;
  tin: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  // False when the caller lacks subbroker.pay: account_number is then masked.
  bank_visible: boolean;
  onboarded_on: string | null;
  status: "Active" | "Suspended" | "Terminated";
  relationship_officer_user_id: number | null;
  relationship_officer: string | null;
  notes: string | null;
  legacy_agency_id: number | null;
  created_by: string | null;
  created_at: string | null;
  current_default_bps?: number | null;
  n_transactions?: number;
}

export interface SubBrokerSplit {
  id: number;
  sub_broker_id: number;
  class_of_business: string | null;
  rate_bps: number;
  effective_from: string;
  effective_to: string | null;
  status: "Pending" | "Approved" | "Rejected";
  is_initial: number;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  reason: string | null;
}

export interface SubBrokerMeta {
  statuses: string[];
  types: string[];
  states: string[];
  classes: string[];
  officers: { id: number; username: string }[];
  accrualBases: string[];
  channels: string[];
  paymentMethods: string[];
  permissions: string[];
  canSeeBank: boolean;
}

export interface CommissionLine {
  id: number;
  kind: "Accrual" | "Reversal";
  status: "Accrued" | "Payable" | "Paid" | "Reversed";
  lineDate: string;
  basis: string;
  channel: string | null;
  transactionId: number;
  policyNo: string | null;
  slipNo: string | null;
  insured: string;
  classOfBusiness: string | null;
  premium: number;
  grossCommission: number;
  splitPercent: number;
  grossShare: number;
  vat: number;
  vatRate: number;
  naicomLevy: number;
  naicomLevyRate: number;
  misc: number;
  miscRate: number;
  net: number;
  paymentId: number | null;
  paymentReference: string | null;
  reversesLineId: number | null;
}

export interface LineTotals {
  grossCommission: number;
  grossShare: number;
  vat: number;
  naicomLevy: number;
  misc: number;
  deductions: number;
  net: number;
}

export interface SubBrokerPayment {
  id: number;
  sub_broker_id: number;
  reference: string;
  payment_date: string;
  method: string;
  total: number;
  currency: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  reissued_as_payment_id: number | null;
  reference_no?: string;
  sub_broker_name?: string;
}

export const pct = (bps: number | null | undefined) => (bps === null || bps === undefined ? "—" : `${bps / 100}%`);

// The caller's sub-broker permissions, read from the backend on every load so
// a grant or revoke applies immediately (same as the server's checks).
export function useSubBrokerMeta() {
  const query = useQuery({ queryKey: ["sub-brokers", "meta"], queryFn: () => api.get<SubBrokerMeta>("/api/sub-brokers/meta"), staleTime: 30_000 });
  const perms = new Set(query.data?.permissions ?? []);
  return {
    ...query,
    meta: query.data,
    can: (permission: string) => perms.has(permission),
  };
}

// Mirrors the server's checks (lib/subBrokers.js) so the form can say what is
// wrong before a round trip. The server remains the authority.
export const isNuban = (v: string) => /^\d{10}$/.test(v.replace(/\s/g, ""));
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isPhone = (v: string) => /^\+?\d{7,15}$/.test(v.replace(/[\s()-]/g, ""));

// "40", "12.5" or "12.5%" -> a number in (0, 100] with at most 2 decimals, else null.
export function parseSplitPercent(raw: string): number | null {
  const t = raw.trim().replace(/%$/, "");
  if (!t || !/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100 ? n : null;
}
