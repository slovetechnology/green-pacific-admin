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
}

export type PaymentStatus = "initiated" | "pending" | "approved" | "rejected" | "cancelled";

export interface PortalPayment {
  id: number;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  method: { code: string; name: string; kind: string | null };
  pay_to: { bank_name: string | null; account_name: string | null; account_number: string | null; narration: string } | null;
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
  quote: { premium: number | null; insurer_quote_no: string | null; quote_source: string | null } | null;
  policy_detail: { status: string | null; policy_no: string | null; error: string | null; transaction_id: number | null; receipt_id: number | null } | null;
  other_attempts: { id: number; reference: string; status: PaymentStatus; created_at: string; reviewed_at: string | null; rejection_reason: string | null }[];
}

export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  kind: "bank_transfer" | "gateway";
  enabled: boolean;
  instructions: string | null;
  details: { bank_name?: string; account_name?: string; account_number?: string };
  updated_by: string | null;
  updated_at: string | null;
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
