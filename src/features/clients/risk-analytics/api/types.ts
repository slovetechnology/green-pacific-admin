// Shapes returned by /api/clients/:id/analytics/*, /reports/risk-management and /risk-profile
// (backend/src/modules/clients/risk-analytics).

export type Tone = "good" | "warn" | "crit" | "neutral";
export type Priority = "Critical" | "High" | "Medium";

export interface Figures {
  written_premium: number;
  earned_premium: number;
  paid: number;
  outstanding: number;
  recoveries: number;
  incurred: number;
  claim_count: number;
  commission_earned: number;
  fees: number;
  direct_expenses: number;
  loss_ratio: number | null;
  severity: number;
  underwriting_profit: number;
  servicing_cost: number;
  brokerage_net: number;
  tier: string;
  tone: Tone;
}

export interface PolicyExperience extends Figures {
  transaction_id: number;
  policy_no: string | null;
  class_of_business: string | null;
  business_type: string | null;
  start_date: string;
  end_date: string;
  in_force: boolean;
  sum_insured: number;
  earned_fraction: number;
  reserves_estimated: boolean;
}

export interface AnalyticsSettings {
  tier_watch_pct: number;
  tier_high_pct: number;
  servicing_cost_pct: number;
  claim_handling_cost: number;
}

export interface ClaimExperience {
  period: string;
  periodLabel: string;
  window: { from: string | null; to: string };
  settings: AnalyticsSettings;
  policies: PolicyExperience[];
  unlinkedClaims: Figures & { claims: string[] };
  portfolio: Figures;
  claimsByType: { loss_type: string; claims: number; incurred: number; causes: string[] }[];
  reservesEstimated: boolean;
  periods: { value: string; label: string }[];
}

export interface Evidence {
  field: string;
  label: string;
  value: unknown;
  source: "profile" | "policies" | "kyc";
  note: string | null;
}

export interface Gap {
  rule_code: string | null;
  gap_category: "Statutory Compulsory" | "Commercial Recommended";
  gap_type: "Missing cover" | "Under-insurance" | "Limit review" | "Expiring" | "Lapsed";
  policy_class: string;
  priority: Priority;
  regulatory_reference: string | null;
  rationale: string;
  suggested_coverage_scope: string | null;
  estimated_minimum_sum_insured: number | null;
  suggested_class: string;
  evidence?: Evidence[];
  transaction_id?: number;
  policy_no?: string | null;
  end_date?: string;
  days_to_expiry?: number;
  band?: string;
  current_sum_insured?: number;
  shortfall?: number;
}

export interface ComplianceRule {
  rule_code: string;
  policy_class: string;
  regulatory_reference: string | null;
  status: "Compliant" | "Non-Compliant" | "Not applicable" | "Unknown";
  priority: Priority;
  rationale: string;
  exempt: boolean;
  held_policies: { id: number; policy_no: string | null; class_of_business: string | null; end_date: string | null }[];
  suggested_class: string;
}

export interface CoverageGaps {
  compliance: {
    status: "Compliant" | "Non-Compliant" | "Under-insured" | "Incomplete profile";
    tone: Tone;
    compliant: number;
    nonCompliant: number;
    unknown: number;
    applicable: number;
    label: string;
    rules: ComplianceRule[];
  };
  gaps: { statutory: Gap[]; commercial: Gap[]; limits: Gap[]; expiring: Gap[] };
  counts: { Critical: number; High: number; Medium: number; total: number };
  facts: (Evidence & { field: string })[];
  profileReviewedAt: string | null;
  hasProfile: boolean;
  asOf: string;
}

export interface Recommendation {
  priority: Priority;
  area: string;
  action: string;
  reason: string;
}

export interface RiskReport {
  client: { id: number; name: string; client_ref: string | null; address: string | null; city: string | null; state: string | null };
  generatedAt: string;
  generatedBy: string | null;
  period: string;
  periodLabel: string;
  health: { score: number; grade: string; tone: Tone };
  executiveSummary: string[];
  experience: ClaimExperience;
  gaps: CoverageGaps;
  recommendations: Recommendation[];
}

export type RiskProfile = Record<string, string | number | null>;

export interface RiskProfileResponse {
  client: { id: number; name: string; client_ref: string | null };
  profile: RiskProfile | null;
  fields: { field: string; label: string; kind: "boolean" | "number" | "text" }[];
  sectors: string[];
  buildingTypes: string[];
  clientTypes: string[];
}

// "A, B, C, D and 3 more" for a compliance row's in-force policies.
export function heldList(held: { policy_no: string | null; class_of_business: string | null }[], max = 4): string {
  const names = held.map((h) => h.policy_no || h.class_of_business || "policy");
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
}

export const PRIORITY_CLASS: Record<Priority, string> = { Critical: "badge-critical", High: "badge-high", Medium: "badge-medium" };
