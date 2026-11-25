// Client for the Policy Endorsement, Reversal & Fiduciary Accounting Engine (backend: /api/endorsement-engine,
// modules/underwriting/endorsement-engine). Money from the engine is integer kobo; fmtKobo shows it in naira.
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";

export const BASE = "/api/endorsement-engine";
export const fmtKobo = (kobo: number | null | undefined) => fmtMoney((Number(kobo) || 0) / 100);

export type Workflow =
  | "MTC_CANCELLATION" | "ITEM_REMOVAL" | "ERROR_REVERSAL" | "OVERPAYMENT_REFUND" | "ENDORSEMENT" | "NON_FINANCIAL_EDIT" | "NON_PAYMENT_WRITE_OFF";
export type WriteOffRoute = "NONE" | "RECOVER_FROM_INSURER" | "BROKER_ABSORBS";
export type NoteType = "DEBIT_NOTE" | "CREDIT_NOTE" | "RP_DEBIT_NOTE" | "RP_CREDIT_NOTE" | "CONTRA_REVERSAL";

export interface AccountingNote {
  id: number;
  note_no: string;
  note_type: NoteType;
  party: "CLIENT" | "INSURER";
  transaction_id: number;
  parent_note_id: number | null;
  endorsement_id: number | null;
  note_date: string;
  gross_premium_cents: number;
  commission_cents: number;
  net_amount_cents: number;
  amount_due_cents: number;
  settled_cents: number;
  status: "DRAFT" | "POSTED" | "PARTIALLY_SETTLED" | "SETTLED" | "REVERSED";
  remittance_status: "UNREMITTED" | "REMITTED" | "OFFSET";
}

export interface Claim {
  id: number;
  claim_no: string;
  status: string;
  claimed_amount: number;
  paid_amount: number;
  blocks: boolean;
}

export interface EndorsementRow {
  id: number;
  endorsement_number: string;
  endorsement_type: Workflow;
  status: "PENDING_APPROVAL" | "POSTED" | "REJECTED";
  effective_date: string;
  posting_date?: string | null;
  gross_rp: number;
  net_rp: number;
  commission_clawback?: number;
  client_credit_cents?: number;
  reason_code?: string;
  audit_notes?: string;
  created_by: string;
  created_at: string;
  approved_by_name?: string | null;
  settlement_route?: string | null;
  write_off_route?: WriteOffRoute | null;
  bad_debt_cents?: number;
  trust_topup_reference?: string | null;
  policy_id?: number;
  "policy.policy_no"?: string | null;
  "policy.credit_note_no"?: string | null;
}

export interface LockSummary {
  transactionId: number;
  locked: boolean;
  isEndorsementNote: boolean;
  notes: AccountingNote[];
  remittanceStatus: "UNREMITTED" | "REMITTED";
  claims: { claims: Claim[]; blocked: boolean; message: string | null };
  endorsements: EndorsementRow[];
  pendingApprovals: EndorsementRow[];
  coverCancelled: EndorsementRow | null;
  allowedWorkflows: Workflow[];
  /** Whether the policy can be written off for non-payment now (expired, posted, something outstanding). */
  writeOff: { eligible: boolean; reason: string | null; outstandingCents?: number; pending?: string };
  categories: Record<Workflow, string>;
  reasonCodes: Record<string, string[]>;
}

export interface TaxLine {
  code: string;
  name: string;
  basis: string;
  rate_bps: number;
  computed_cents: number;
  refundable: boolean;
  refunded_cents: number;
  cash_cents: number;
}

export interface Calc {
  basis: string;
  policyDays: number;
  unexpiredDays: number;
  retainedBps: number | null;
  premiumBase: number;
  commissionRatio: number;
  grossRp: number;
  clawback: number;
  netRp: number;
  adminFee: number;
  taxes: TaxLine[];
  taxRefund: number;
  clientCreditNote: number;
  earned: number;
  cash: { grossCash: number; clawbackCash: number; netCash: number; taxCash: number; feeCash: number; walletCredit: number };
  offset: number;
}

export interface Figures { gross: number; commission: number; net: number }

export interface Preview {
  endorsementType: Workflow;
  effectiveDate: string;
  basis: string;
  item: { id: number; item_value: number; item_premium_cents: number; premium_source: string; [k: string]: unknown } | null;
  days: { policyDays: number; unexpiredDays: number; elapsedDays: number };
  shortRate: { months: number; source: string } | null;
  policy: { policy_no: string | null; credit_note_no: string | null; client_name: string; insurer_name: string; start_date: string; end_date: string };
  calc: Calc;
  remittanceStatus: "UNREMITTED" | "REMITTED";
  settlementRoute: "NET_OFF" | "PENDING_INSURER_REFUND" | "NONE";
  claims: LockSummary["claims"];
  comparison: { original: Figures; earned: Figures; returned: Figures };
  documents: {
    rpDebitNote: { title: string; to: string; parent: string; gross: number; commission: number; net: number; amountDue: number; badge: string };
    rpCreditNote: { title: string; to: string; parent: string; gross: number; adminFee: number; taxRefund: number; amountDue: number; cashRefund: number; offsetAgainstOutstanding: number };
  };
}

export interface WriteOffCalc {
  basis: "WRITE_OFF";
  policyPremium: number;
  policyBrokerage: number;
  premiumPaid: number;
  netRemitted: number;
  commissionRatio: number;
  outstanding: number;
  grossRp: number;
  clawback: number;
  netRp: number;
  offset: number;
  earned: number;
  insurerExposure: number;
  route: WriteOffRoute;
  badDebt: number;
  recoverable: number;
}

export interface WriteOffPreview {
  endorsementType: "NON_PAYMENT_WRITE_OFF";
  policy: Preview["policy"] & { premium_due: number; premium_paid: number; balance_os: number; billing_mode: string; debit_note_no: string | null };
  calc: WriteOffCalc;
  remittanceStatus: "UNREMITTED" | "REMITTED";
  claims: LockSummary["claims"];
  routeRequired: boolean;
  documents: {
    rpDebitNote: { title: string; to: string; parent: string; gross: number; commission: number; net: number; amountDue: number };
    rpCreditNote: { title: string; to: string; parent: string; gross: number; amountDue: number; offsetAgainstOutstanding: number };
  };
}

export interface EndorsementDetail extends EndorsementRow {
  calc: Calc | null;
  notes: AccountingNote[];
  journal?: { posted: boolean; journalNo?: string; reason?: string } | null;
  cloneId?: number | null;
  cloneError?: string | null;
  corrected_transaction_id?: number | null;
}

export interface TimelineEvent {
  at: string;
  kind: "placement" | "note" | "endorsement" | "receipt" | "remittance" | "insurer_refund" | "credit" | "refund" | "audit";
  title: string;
  reference?: string;
  status?: string | null;
  remittanceStatus?: string;
  party?: string;
  amountCents?: number;
  parentRef?: string | null;
  detail?: string | null;
  by?: string;
  approvedBy?: string | null;
  journal?: string | null;
  link?: string | null;
  writeOffRoute?: WriteOffRoute | null;
  badDebtCents?: number;
  trustTopupReference?: string | null;
}

export interface CreditEntry {
  id: number;
  entry_date: string;
  entry_type: string;
  amount_cents: number;
  remaining_cents?: number;
  ledger_key: string;
  hold_status: "AVAILABLE" | "PENDING_INSURER_REFUND";
  prefunded: number;
  narration: string | null;
}

export interface Wallet {
  client: { id: number; name: string };
  availableCents: number;
  pendingInsurerRefundCents: number;
  credits: CreditEntry[];
  movements: CreditEntry[];
  openNotes: { id: number; policy_no: string | null; debit_note_no: string | null; class_of_business: string | null; balance_os: number }[];
  refunds: Refund[];
}

export interface Refund {
  id: number;
  voucher_no: string;
  client_id: number;
  client_name?: string;
  amount_cents: number;
  trust_amount_cents: number;
  operating_amount_cents: number;
  status: "PENDING_APPROVAL" | "APPROVED" | "PAID" | "RECONCILED" | "CANCELLED";
  reason: string;
  payee_bank_details: string | null;
  payment_reference: string | null;
  paid_date: string | null;
  bank_statement_ref: string | null;
  created_by: string;
  approved_by_name: string | null;
  created_at: string;
}

export const engine = {
  lock: (txId: number | string) => api.get<LockSummary>(`${BASE}/transactions/${txId}/lock`),
  timeline: (txId: number | string) => api.get<{ events: TimelineEvent[] }>(`${BASE}/transactions/${txId}/timeline`),
  postNotes: (txId: number | string) => api.post(`${BASE}/transactions/${txId}/post-notes`),
  intent: (txId: number | string, body: { category: Workflow; remarks: string; action_attempted: string }) => api.post(`${BASE}/transactions/${txId}/modification-intents`, body),
  preview: (txId: number | string, body: Record<string, unknown>) => api.post<Preview>(`${BASE}/transactions/${txId}/endorsements/preview`, body),
  apply: (txId: number | string, body: Record<string, unknown>) => api.post<EndorsementDetail>(`${BASE}/transactions/${txId}/endorsements`, body),
  requestReversal: (txId: number | string, body: Record<string, unknown>) => api.post<EndorsementDetail>(`${BASE}/transactions/${txId}/reversal-requests`, body),
  previewWriteOff: (txId: number | string, body: { route?: WriteOffRoute }) => api.post<WriteOffPreview>(`${BASE}/transactions/${txId}/write-offs/preview`, body),
  requestWriteOff: (txId: number | string, body: { route?: WriteOffRoute; remarks: string }) => api.post<EndorsementDetail>(`${BASE}/transactions/${txId}/write-offs`, body),
  endorsements: (status?: string) => api.get<{ endorsements: EndorsementRow[] }>(`${BASE}/endorsements${status ? `?status=${status}` : ""}`),
  approve: (id: number, body?: { trust_topup_reference?: string }) => api.post<EndorsementDetail>(`${BASE}/endorsements/${id}/approve`, body),
  reject: (id: number, reason: string) => api.post<EndorsementDetail>(`${BASE}/endorsements/${id}/reject`, { reason }),
  openRpDebitNotes: () => api.get<{ notes: (AccountingNote & { insurer_name: string; client_name: string; settlement_target_cents: number })[] }>(`${BASE}/notes/open-rp-debit-notes`),
  insurerRefund: (noteId: number, body: Record<string, unknown>) => api.post(`${BASE}/notes/${noteId}/insurer-refunds`, body),
  wallet: (clientId: number | string) => api.get<Wallet>(`${BASE}/clients/${clientId}/credit`),
  allocate: (clientId: number | string, body: Record<string, unknown>) => api.post<{ refund: Refund | null }>(`${BASE}/clients/${clientId}/credit/allocate`, body),
  prefund: (entryId: number) => api.post(`${BASE}/credit-entries/${entryId}/prefund`),
  refunds: (status?: string) => api.get<{ refunds: Refund[] }>(`${BASE}/refunds${status ? `?status=${status}` : ""}`),
  approveRefund: (id: number) => api.post(`${BASE}/refunds/${id}/approve`),
  payRefund: (id: number, body: Record<string, unknown>) => api.post(`${BASE}/refunds/${id}/pay`, body),
  reconcileRefund: (id: number, body: Record<string, unknown>) => api.post(`${BASE}/refunds/${id}/reconcile`, body),
  cancelRefund: (id: number, reason: string) => api.post(`${BASE}/refunds/${id}/cancel`, { reason }),
  settings: () => api.get<{ taxes: Tax[]; shortRateScales: { insurer_id: number | null; max_months_in_force: number; retained_bps: number }[] }>(`${BASE}/settings`),
  updateTax: (id: number, body: Record<string, unknown>) => api.put(`${BASE}/settings/taxes/${id}`, body),
};

export interface Tax {
  id: number;
  code: string;
  name: string;
  basis: string;
  rate_bps: number;
  fixed_amount_cents: number;
  gl_account_key: string;
  is_refundable_on_cancellation: number;
  is_active: number;
}

export const WORKFLOW_LABEL: Record<Workflow, string> = {
  MTC_CANCELLATION: "Mid-term cancellation",
  ITEM_REMOVAL: "Item deletion endorsement",
  ERROR_REVERSAL: "Reversal of entry in error",
  OVERPAYMENT_REFUND: "Overpayment / client refund",
  ENDORSEMENT: "Endorsement",
  NON_FINANCIAL_EDIT: "Non-financial edit",
  NON_PAYMENT_WRITE_OFF: "Write-off for non-payment",
};

export const WRITE_OFF_ROUTE_LABEL: Record<WriteOffRoute, string> = {
  NONE: "Nothing paid to the insurer: cancel only",
  RECOVER_FROM_INSURER: "Recover from the insurer",
  BROKER_ABSORBS: "Broker absorbs (bad debt)",
};

export const NOTE_LABEL: Record<NoteType, string> = {
  CREDIT_NOTE: "Credit Note (insurer)",
  DEBIT_NOTE: "Debit Note (client)",
  RP_DEBIT_NOTE: "RP Debit Note (insurer)",
  RP_CREDIT_NOTE: "RP Credit Note (client)",
  CONTRA_REVERSAL: "Contra reversal",
};

export const humanize = (code: string) => code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
