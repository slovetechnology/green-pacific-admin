import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// Shapes returned by /api/reinsurance (backend routes/reinsurance*.js).
// Amounts arrive as integer minor units (kobo/cents) with a currency code,
// percentages as basis points (10000 = 100%). Never do float maths on them.

export interface RiStatus { enabled: boolean; permissions: string[]; roles: string[] }

export function useReinsuranceStatus(enabled = true) {
  const query = useQuery({
    queryKey: ["ri", "status"],
    queryFn: () => api.get<RiStatus>("/api/reinsurance/status"),
    staleTime: 60_000,
    enabled,
  });
  const can = (permission: string) => Boolean(query.data?.enabled && query.data.permissions.includes(permission));
  return { status: query.data, isLoading: query.isLoading, can };
}

export interface Party {
  id: number; reference_no: string; party_type: string; name: string; legal_name: string | null; country: string | null;
  market_category: string | null; status: string; blocked_reason: string | null; sanctions_status: string; kyc_status: string; kyc_expiry: string | null;
  licence_no: string | null; licence_expiry: string | null; insurer_id: number | null; address: string | null; website: string | null; notes: string | null;
}
export interface Rating { id: number; agency: string; rating: string; outlook: string | null; rating_date: string; is_current: number }
export interface Contact { id: number; name: string; role: string | null; email: string | null; phone: string | null; is_primary: number }
export interface BankAccount { id: number; currency: string; bank_name: string; account_name: string; account_number: string | null; iban: string | null; swift_bic: string | null; status: string; masked: boolean }
export interface PartyDetail extends Party {
  ratings: Rating[]; contacts: Contact[]; bankAccounts: BankAccount[];
  appetite: { id: number; business_type: string; class_of_business: string | null; territory: string | null; preferred_line_bps: number | null }[];
  bindability: { ok: boolean; blockers: string[]; warnings: string[] };
}

export interface Line {
  id: number; layer_id: number | null; layer_no: number | null; reinsurer_party_id: number; name: string; reference_no: string; market_category: string | null; country: string | null; role: "Lead" | "Follower";
  status: string; written_bps: number; signed_bps: number; ratings: { agency: string; rating: string; outlook: string | null }[];
  flags: { blockers: string[]; warnings: string[] };
}
export interface Quote {
  id: number; layer_id: number | null; commission_bps: number | null; reinsurer_party_id: number; name: string; version: number; kind: string; rate_ppm: number | null; premium_minor: number; offered_line_bps: number;
  brokerage_bps: number | null; valid_until: string | null; subjectivities: string | null; warranties: string | null; status: string;
  cheapest?: boolean; lead?: boolean; differs_from_lead?: boolean; created_by: string; created_at: string;
}
export interface Reconcile { totalBps: number; targetBps: number; diffBps: number; status: "Reconciled" | "Under-placed" | "Over-placed" }
export interface Capacity {
  currency: string; treaty: { id: number; ref: string; name: string; type: string } | null; sumInsuredMinor: number; retentionMinor: number;
  treatyCapacityMinor: number; treatyUsedMinor: number; treatyAvailableMinor: number; treatyTakesMinor: number; facRequiredMinor: number; facNeeded: boolean;
  recordedFacRequiredMinor: number; placedBps: number; placedMinor: number; facRemainingMinor: number; overCeded: boolean; overCededMinor: number; warnings: string[];
}
export interface Checks { ok: boolean; blockers: string[]; warnings: string[]; offshore: boolean }
export interface Approval {
  id: number; placement_id: number; action: "Bind" | "Sign"; status: string; requested_by: string; requested_at: string; decided_by: string | null;
  decided_at: string | null; note: string | null; warnings: string[];
}
export interface LayerSplit {
  layer_id: number | null; layer_no: number | null; premium100Minor: number; premiumForOrderMinor: number; brokerageMinor: number; netMinor: number; signed: boolean; ratePpm: number | null;
  rows: { reinsurer_party_id: number; name: string; role: string; line_bps: number; premium_minor: number; brokerage_minor: number; net_minor: number; differs_from_lead: boolean }[];
}
export interface PremiumSplit {
  layers: LayerSplit[];
  currency: string; premium100Minor: number; premiumForOrderMinor: number; brokerageBps: number; brokerageMinor: number; netMinor: number; signed: boolean;
  rows: { reinsurer_party_id: number; name: string; role: string; line_bps: number; premium_minor: number; brokerage_minor: number; net_minor: number; differs_from_lead: boolean }[];
}
export interface LayerReconcile { layer_id: number | null; layer_no: number | null; limit_minor: number | null; retention_minor: number | null; description: string | null; written: Reconcile; invited: Reconcile; signed: Reconcile }
export interface TreatyLayer { id: number; layer_no: number; description: string | null; limit_minor: number | null; retention_minor: number | null; rate_bps: number | null; deposit_premium_minor: number | null }
export interface PlacementView {
  subjectType: "Facultative" | "Treaty";
  treaty: (TreatyTerms & { commission: Commission; reinstatements: Reinstatement[] }) | null;
  layers: TreatyLayer[];
  reconcileByLayer: LayerReconcile[];
  placement: { id: number; placement_ref: string; status: string; currency: string; order_bps: number; version: number; created_by: string; updated_at: string };
  fac: null | {
    id: number; fac_ref: string; fac_type: string; document_type: string; original_insured: string | null; class_of_business: string | null; risk_description: string | null;
    location: string | null; sum_insured_minor: number; pml_minor: number | null; mfl_minor: number | null; cedant_retention_minor: number;
    treaty_capacity_used_minor: number; required_fac_minor: number; period_start: string | null; period_end: string | null; transaction_id: number | null;
  };
  cedant: { id: number; name: string; reference_no: string };
  transaction: { id: number; policy_no: string | null; client_name: string } | null;
  lines: Line[];
  reconcile: { written: Reconcile; invited: Reconcile; signed: Reconcile } | null;
  capacity: Capacity | null; checks: Checks; bindChecks: Checks | null;
  quotes: Quote[]; comparison: Quote[]; premium: PremiumSplit | null; approvals: Approval[];
  evidence: { id: number; evidence_type: string; description: string; evidence_date: string; offered_line_bps: number | null; local_party_name: string | null; document_ref: string | null }[];
  offshoreApproval: { status: string; reference: string | null; notes: string | null; submitted_at: string | null; decided_at: string | null };
  correspondence: { id: number; party_name: string | null; direction: string; channel: string; subject: string; body: string | null; to_address: string | null; status: string; created_at: string }[];
  clauses: { clause_id: number; code: string; title: string; clause_type: string }[];
  history: { id: number; from_status: string | null; to_status: string; actor: string; reason: string | null; created_at: string }[];
  signedLog: { id: number; reinsurer_party_id: number; written_bps: number; signed_bps: number; actor: string; approved_by: string; created_at: string }[];
  documents: { id: number; doc_type: string; format: string; placement_status: string; generated_by: string; created_at: string }[];
  slip: { id: number; slip_number: string; status: string; version: number } | null;
  nextStatuses: string[];
}

export const PIPELINE = ["Enquiry", "Submission Prepared", "Marketed", "Quotes In", "Firm Order", "Bound", "Slip Signed", "Documented", "Invoiced", "Collecting", "Settled", "Closed"];

export const bpsText = (bps: number | null | undefined) => (bps === null || bps === undefined ? "—" : `${(bps / 100).toFixed(2)}%`);

// 123456789 minor units of USD -> "USD 1,234,567.89". Integer arithmetic only.
export function minorText(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "—";
  const sign = minor < 0 ? "-" : "";
  const digits = String(Math.abs(minor)).padStart(3, "0");
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${whole}.${digits.slice(-2)}`;
}

// "41.67" (percent) -> 4167 basis points, or null if it isn't a valid percentage.
export function percentToBps(text: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
  return bps > 0 && bps <= 10000 ? bps : null;
}

// 123450 -> "1234.50" (for pre-filling an amount field).
export function minorDecimal(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const sign = minor < 0 ? "-" : "";
  const digits = String(Math.abs(minor)).padStart(3, "0");
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");


// ---- treaties -----------------------------------------------------------------------------------------
export interface Commission {
  type: "none" | "flat" | "sliding";
  flat?: { rate_bps: number };
  sliding?: { provisional_bps: number; min_bps: number; max_bps: number; bands: { lr_from_bps: number; lr_to_bps: number | null; commission_bps: number }[] };
  profit: null | { share_bps: number; management_expense_bps: number; deficit_carry_forward_years: number };
}
export interface Reinstatement { premium_bps: number; basis: "pro_rata_amount" | "pro_rata_time_amount" | "flat" }
export interface TreatyTerms {
  id: number; treaty_ref: string; name: string; cedant_party_id: number; treaty_type: string; basis: string; treaty_year: number; period_start: string; period_end: string;
  currency: string; class_of_business: string | null; sub_classes: string[]; territorial_scope: string | null; original_inception_scope: string | null;
  retention_minor: number | null; limit_minor: number | null; lines_count: number | null; cession_bps: number | null; ceding_commission_bps: number | null;
  brokerage_bps: number | null; brokerage_deducted_from: string | null; epi_minor: number | null; mdp_minor: number | null; min_premium_minor: number | null;
  rate_on_spi_bps: number | null; exclusions: string | null; special_conditions: string | null; premium_payment_warranty_days: number | null; no_premium_no_cover: number;
  status: string; display_status?: string; version: number; previous_treaty_id: number | null;
}
export interface TreatyRow {
  id: number; treaty_ref: string; name: string; treaty_type: string; basis: string; treaty_year: number; period_start: string; period_end: string; currency: string;
  class_of_business: string | null; status: string; display_status: string; version: number; previous_treaty_id: number | null; cedant_name: string; placement_id: number | null;
}
export interface Experience {
  id: number; underwriting_year: number; treaty_ref: string; currency: string; spi_minor: number; ceded_premium_minor: number; paid_losses_minor: number;
  os_reserves_minor: number; incurred_minor: number; loss_ratio_bps: number | null; claims_count: number; large_loss_count: number; notes: string | null;
}
export interface Endorsement {
  id: number; endorsement_no: number; kind: "Alteration" | "Cancellation" | "Run-off"; effective_date: string; description: string; status: string;
  requested_by: string; requested_at: string; decided_by: string | null; note: string | null; changes: Record<string, { from: unknown; to: unknown }>;
}
export interface TreatyView {
  treaty: TreatyTerms & { commission: Commission; reinstatements: Reinstatement[] };
  cedant: { id: number; name: string; reference_no: string };
  layers: TreatyLayer[];
  readiness: { ok: boolean; blockers: string[]; warnings: string[] };
  clauses: { clause_id: number; code: string; title: string; clause_type: string; wording: string }[];
  availableClauses: { id: number; code: string; title: string; category: string | null; is_mandatory: boolean; attached: boolean }[];
  experience: Experience[];
  versions: { id: number; version: number; reason: string | null; actor: string; created_at: string }[];
  endorsements: Endorsement[];
  previous: { id: number; treaty_ref: string; treaty_year: number; status: string } | null;
  next: { id: number; treaty_ref: string; treaty_year: number; status: string } | null;
  placement: { id: number; placement_ref: string; status: string } | null;
}
export interface Renewal {
  treaty_id: number; treaty_ref: string; name: string; treaty_type: string; treaty_year: number; class_of_business: string | null; cedant_name: string; currency: string;
  period_end: string; days_left: number; bucket: string; display_status: string; renewal: { id: number; treaty_ref: string; status: string } | null;
  placement: { id: number; placement_ref: string; status: string } | null; latest_loss_ratio_bps: number | null; latest_experience_year: number | null;
}
export interface Attachment { id: number; owner_type: string; owner_id: number; category: string; name: string; version: number; original_name: string; size_bytes: number; sha256: string; note: string | null; uploaded_by: string; uploaded_at: string }
export interface AttachmentGroup { name: string; category: string; latest: Attachment; versions: Attachment[] }
export interface YoY {
  current: { id: number; ref: string; year: number }; previous: { id: number; ref: string; year: number } | null;
  terms: { field: string; label: string; from: string; to: string; changed: boolean }[];
  layers: { layer_no: number; status: string; limit: { from: string; to: string; changed: boolean }; retention: { from: string; to: string; changed: boolean }; rate: { from: string; to: string; changed: boolean } }[];
  lineup: { reinsurer: string; layer_no: number | null; previous_bps: number | null; current_bps: number | null; change: string }[];
  premium: { layer_no: number | null; previous_minor: number | null; current_minor: number | null }[];
  changedTerms?: number;
}
