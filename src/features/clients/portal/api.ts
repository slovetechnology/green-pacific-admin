// The customer portal, seen from the staff side: quote requests customers start (drafts included, for follow-up),
// their payments (proof of a bank transfer, approved or rejected here) and the payment methods customers see.
// Backend: modules/portal/customer-quotes (staffQuoteRequests.routes.js) and customer-payments (staffPayments.routes.js).

export interface PortalCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  client_id: number | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface PortalQuote {
  status: "requested" | "quoted" | "awaiting_staff";
  premium: number | null;
  currency: string;
  insurer_quote_no: string | null;
  quoted_at: string | null;
  message: string | null;
  source?: "insurer" | "staff" | null;
  insurer_quote_ref?: string | null;
  staff_note?: string | null;
  error?: string | null;
  /** Staff only: what the insurer charges, and Green Pacific's markup on it (premium = insurer_premium + markup_amount). */
  insurer_premium?: number | null;
  markup_amount?: number | null;
  markup_rule?: string | null;
  /** The customer's price in their billing currency (converted from the naira premium when quoted), and the rate used. */
  billing?: BillingPrice | null;
}

export interface BillingPrice {
  currency: string;
  amount: number | null;
  rate: number | null;
  rate_date: string | null;
}

export interface PortalPolicy {
  status: "issuing" | "issued" | "awaiting_staff";
  policy_no: string | null;
  start_date: string | null;
  end_date: string | null;
  issued_at: string | null;
  insurer_policy_ref?: string | null;
  error?: string | null;
  transaction_id?: number | null;
  receipt_id?: number | null;
}

export interface PortalProduct {
  id: string;
  name: string;
  category: string | null;
  source: string;
}

export interface PortalRequestRow {
  id: number;
  reference: string | null;
  status: "draft" | "submitted" | "abandoned";
  review_status: string | null;
  customer: PortalCustomer | null;
  product: PortalProduct;
  sections_complete: number;
  sections_total: number;
  last_section: string | null;
  last_activity_at: string | null;
  idle_days: number | null;
  abandon_reason: string | null;
  follow_up_count: number;
  created_at: string | null;
  submitted_at: string | null;
  quote: PortalQuote | null;
  policy: PortalPolicy | null;
}

export interface PaymentSummary {
  id: number;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  method: string;
  rejection_reason: string | null;
  created_at: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  proof_uploaded_at?: string | null;
}

export interface FollowUp {
  id: number;
  note: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PortalRequestDetail {
  id: number;
  reference: string | null;
  status: "draft" | "submitted" | "abandoned";
  review_status: string | null;
  product: PortalProduct & { provider_name: string };
  progress: { key: string; title: string; complete: boolean; missing: { field: string; label: string }[] }[];
  answers: { title: string; lines: { label: string; value: string }[] }[];
  customer: PortalCustomer | null;
  last_activity_at: string | null;
  idle_days: number | null;
  submitted_at: string | null;
  abandon_reason: string | null;
  /** The policy this request renews (started from the customer's policies), or null. */
  renewal_of_policy_id?: number | null;
  abandon_note: string | null;
  quote_request_id: number | null;
  quote: PortalQuote | null;
  policy: PortalPolicy | null;
  payment: PaymentSummary | null;
  payments: PaymentSummary[];
  next_step: string | null;
  erp_policy: { id: number; policy_no: string | null; status: string; premium_due: number; premium_paid: number; balance_os: number; debit_note_no: string | null } | null;
  follow_ups: FollowUp[];
  /** The policy's documents on file; the insurer's copies (from_insurer) arrive a few minutes after issue. */
  documents: { id: number; type: string; title: string | null; from_insurer: boolean; added_at: string | null }[];
  /** Its row in the quote request inbox and its Pipeline deal (handled from this page). */
  sales: {
    inbox_id: number; inbox_status: string; staff_notes: string | null; handled_by: string | null; handled_at: string | null; client_id: number | null;
    deal: { id: number; deal_name: string; stage: string; owner: string | null; expected_close_date: string | null; estimated_premium: number | null; deal_type: string; next_action: string | null; next_action_at: string | null } | null;
  } | null;
}

export type PaymentStatus = "initiated" | "pending" | "approved" | "rejected" | "cancelled";

export interface PortalPayment {
  id: number;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  method: { code: string; name: string; kind: string | null };
  pay_to: {
    bank_name: string | null; account_name: string | null; account_number: string | null; narration: string; currency?: string;
    swift_code?: string; iban?: string; sort_code?: string; bank_address?: string;
  } | null;
  /** The naira price this payment settles (the quote's premium), whatever currency it was paid in. */
  ngn_amount?: number | null;
  quote_request: { id: number; reference: string | null; product_name: string | null; product_source?: string };
  proof: { name: string; size: number; type: string | null; uploaded_at: string } | null;
  payer_name: string | null;
  payer_reference: string | null;
  paid_on: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  approval_note: string | null;
  cancelled_at: string | null;
  customer: PortalCustomer | null;
}

export interface PortalPaymentDetail extends PortalPayment {
  quote: {
    premium: number | null; insurer_quote_no: string | null; quote_source: string | null; insurer_premium?: number | null; markup_amount?: number | null; markup_rule?: string | null;
    currency?: string; billing?: BillingPrice;
  } | null;
  policy_detail: { status: string | null; policy_no: string | null; error: string | null; transaction_id: number | null; receipt_id: number | null } | null;
  other_attempts: { id: number; reference: string; status: PaymentStatus; created_at: string; reviewed_at: string | null; rejection_reason: string | null }[];
}

export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  kind: "bank_transfer" | "gateway";
  /** The currency the account takes payment in. */
  currency: string;
  enabled: boolean;
  instructions: string | null;
  details: { bank_name?: string; account_name?: string; account_number?: string; swift_code?: string; iban?: string; sort_code?: string; bank_address?: string };
  updated_by: string | null;
  updated_at: string | null;
}

/** A currency in the firm's currency table, as Customer Portal > Billing Currencies shows it. */
export interface CurrencyRow {
  code: string;
  name: string;
  decimals: number;
  active: boolean;
  billing: boolean;
  base: boolean;
  rate: { rate: number; rate_micro: number; rate_date: string; stale: boolean } | null;
}

/** "₦1,500.00", "USD 110.00": an amount in its currency. */
export function fmtCurrency(value: unknown, currency: string | null | undefined = "NGN"): string {
  const n = Number(value);
  const amount = (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return !currency || currency === "NGN" ? `₦${amount}` : `${currency} ${amount}`;
}

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  awaiting_kyc: "Waiting for KYC",
  requested: "Asking insurer",
  quoted: "Quoted",
  awaiting_staff: "Needs our quote",
};
export const POLICY_STATUS_LABELS: Record<string, string> = {
  issuing: "Issuing",
  issued: "Issued",
  awaiting_staff: "Needs staff",
};
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  initiated: "Awaiting proof",
  pending: "To check",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
export const FOLLOW_UP_REASONS = ["Price concern", "Bought cover elsewhere", "Needs more information", "Not ready yet", "Form too long or unclear", "Could not reach the customer", "Other"];

export const providerName = (source: string | null | undefined) => (source === "LEADWAY" ? "Leadway" : source === "EMPLE" ? "emPLE" : source || "—");
export const shortDate = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : "—");
export const dateTime = (value: string | null | undefined) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
