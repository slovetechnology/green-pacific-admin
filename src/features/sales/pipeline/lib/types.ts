// Shapes of the /api/deals responses, and the stage rules the screens mirror.
// The server is the authority on every rule below: this copy only lets the board
// show which columns a card may be dropped on before the request is made.
import { ApiError } from "@/shared/api/client";

export const STAGES = ["Lead", "Qualified", "In Market", "Proposal", "Negotiation", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["Lead", "Qualified", "In Market", "Proposal", "Negotiation"];

const FORWARD: Partial<Record<Stage, Stage[]>> = {
  Lead: ["Qualified"],
  Qualified: ["In Market"],
  "In Market": ["Proposal"],
  Proposal: ["Negotiation", "Won"],
  Negotiation: ["Won"],
};
const BACK: Partial<Record<Stage, Stage>> = { Qualified: "Lead", "In Market": "Qualified", Proposal: "In Market", Negotiation: "Proposal" };

export type MoveKind = "forward" | "back" | "lost" | "reopen";

export function moveKind(from: string, to: string): MoveKind | null {
  const a = from as Stage;
  const b = to as Stage;
  if (!STAGES.includes(a) || !STAGES.includes(b) || a === b) return null;
  if (b === "Lost") return OPEN_STAGES.includes(a) ? "lost" : null;
  if (a === "Lost") return b === "Lead" ? "reopen" : null;
  if (a === "Won") return null;
  if (FORWARD[a]?.includes(b)) return "forward";
  if (BACK[a] === b) return "back";
  return null;
}

export function legalMoves(from: string): Stage[] {
  return STAGES.filter((to) => moveKind(from, to) !== null);
}

export function stageSlug(stage: string): string {
  return stage.toLowerCase().replace(/\s+/g, "-");
}

export interface GateItem {
  code: string;
  field: string;
  message: string;
  // Which tab of the deal page fixes it.
  where: string;
}

export interface GateResult {
  missing: GateItem[];
  warnings: { code: string; message: string }[];
}

export interface DealRow {
  id: number;
  deal_name: string;
  client_id: number;
  client_name: string;
  stage: Stage;
  deal_type: "New" | "Renewal";
  class_of_business: string | null;
  estimated_premium: number;
  estimated_commission_rate: number;
  weighted_value: number;
  probability: number;
  owner_user_id: number | null;
  owner_name: string | null;
  producer_name: string | null;
  source: string | null;
  x_date: string | null;
  expected_close_date: string | null;
  stage_entered_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  sub_broker_id: number | null;
  lost_reason_code: string | null;
  next_step_label?: string;
  next_step_ready?: boolean;
  next_step_stage?: string;
}

// What an agent gets for a deal they introduced: a summary, nothing about earnings.
export interface AgentDealRow {
  id: number;
  deal_name: string;
  client_name: string;
  class_of_business: string | null;
  stage: Stage;
  deal_type: "New" | "Renewal";
  estimated_premium: number;
  expected_close_date: string | null;
  created_at: string | null;
}

export interface ListResponse {
  deals: DealRow[];
  total: number;
  counts: Record<string, number>;
  openTotal: number;
  staleDays: number;
  stages: Stage[];
}

export interface FormOptions {
  clients: { id: number; name: string; lifecycle_stage: string | null }[];
  owners: { id: number; username: string }[];
  insurers: { id: number; name: string }[];
  campaigns: { id: number; name: string }[];
  subBrokers: { id: number; name: string; reference_no: string }[];
  classes: string[];
  sources: string[];
  dealTypes: string[];
  lossReasons: string[];
}

export interface Quote {
  id: number;
  insurer_id: number;
  insurer_name: string;
  quote_reference: string | null;
  premium: number;
  commission_rate: number; // a fraction
  deductible: number | null;
  terms: string | null;
  status: "Received" | "Selected" | "Declined";
  received_at: string | null;
  exclusions_json?: string | null;
  coverage_limits_json?: string | null;
  // Quote revisions (migration 0036): the revision number, and the terms added with it.
  revision?: number;
  currency?: string;
  line_offered?: number; // a fraction: the share of the risk offered
  valid_until?: string | null;
  subjectivities?: string[];
}

export interface CompareQuote extends Quote {
  isRecommended: boolean;
  isCompliant: boolean;
  isFullyConfirmed: boolean;
  excludedMandatoryCoverages: string[];
  unconfirmedMandatoryCoverages: string[];
  coverageLimits: Record<string, number>;
  exclusions: string[];
  totalCoverageLimit: number;
  currency: string;
  lineOffered: number;
  isPartLine: boolean;
  isExpired: boolean;
}

export interface CompareResponse {
  quotes: CompareQuote[];
  recommendedQuoteId: number | null;
  hasCompliantQuote: boolean;
  mandatoryCoverages: { code: string; title: string }[];
  selectedQuoteId: number | null;
  currencies?: string[];
  expiredCount?: number;
}

export interface Deal extends Omit<DealRow, "next_step_label" | "next_step_ready" | "next_step_stage"> {
  industry_naics?: string | null;
  producer_id: number | null;
  commission_split_producer: number;
  lead_source_detail: string | null;
  campaign_id: number | null;
  lost_reason: string | null;
  bound_transaction_id: number | null;
  parent_transaction_id: number | null;
  quote_request_id: number | null;
  sub_broker_split_bps: number | null;
  subject_matter: string | null;
  sum_insured: number;
  deductible: number;
  period_start: string | null;
  period_end: string | null;
  risk_details_json: string | null;
  target_insurer_ids_json: string | null;
  selected_quote_id: number | null;
  closed_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  archived_at: string | null;
}

export interface Activity {
  id: number;
  occurred_at: string | null;
  created_at: string | null;
  activity_type: string;
  channel: string | null;
  subject: string | null;
  notes: string | null;
  created_by: string | null;
  recording_file_path: string | null;
}

export interface HistoryRow {
  id: number;
  from_stage: string | null;
  to_stage: string;
  reason: string | null;
  actor: string | null;
  approximate: number;
  entered_at: string;
}

export interface DocumentRow {
  id: number;
  doc_type: string;
  title: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface NextAction {
  stage: Stage;
  ready: boolean;
  code: string;
  label: string;
  where: string;
  message: string | null;
}

export interface DealDetail {
  deal: Deal;
  activities: Activity[];
  clientTransactions: { id: number; policy_no: string | null; class_of_business: string | null; trans_date: string | null }[];
  documents: DocumentRow[];
  quotes: Quote[];
  slips: { id: number; slip_number: string; slip_type: string; status: string }[];
  history: HistoryRow[];
  kyc: { id: number; status: string; risk_level: string | null } | null;
  /** The quote request this deal was opened from, with the customer who sent it. */
  quoteRequest?: {
    id: number; reference: string | null; status: string; source: string | null; created_at: string | null;
    customer: { id: number | null; name: string; email: string | null; phone: string | null } | null;
    portal: { id: number; product_name: string | null; quote_status: string | null; premium: number | null; policy_status: string | null; policy_no: string | null } | null;
  } | null;
  policy: {
    id: number; policy_no: string | null; debit_note_no: string | null; premium_due: number; commission_rate: number;
    total_brokerage: number; commission_earned: number; status: string; start_date: string | null; end_date: string | null; insurer_name: string;
  } | null;
  subBroker: { id: number; name: string; reference_no: string; status: string } | null;
  parentPolicy: { id: number; policy_no: string | null; end_date: string | null; premium_due: number } | null;
  gates: Partial<Record<Stage, GateResult>>;
  nextAction: NextAction | null;
  weightedValue: number;
  staleDays: number;
  lossReasons: string[];
  dealTypes: string[];
  activityTypes: string[];
  commsActivityTypes: string[];
  docTypes: string[];
}

export interface AgentDealDetail {
  deal: AgentDealRow & { sum_insured?: number; subject_matter?: string | null; period_start?: string | null; period_end?: string | null; source?: string | null };
  history: { to_stage: string; entered_at: string }[];
}

export function isStaffDetail(data: DealDetail | AgentDealDetail): data is DealDetail {
  return "gates" in data;
}

// ---- errors ----

// The API explains a refused stage move with a list of what is missing, and a
// refused policy with the compliance failures. Pull those out for display.
export function missingOf(err: unknown): GateItem[] {
  if (!(err instanceof ApiError)) return [];
  const missing = err.data?.missing;
  return Array.isArray(missing) ? (missing as GateItem[]) : [];
}

export function complianceOf(err: unknown): { message: string }[] {
  if (!(err instanceof ApiError)) return [];
  const list = err.data?.compliance;
  return Array.isArray(list) ? (list as { message: string }[]) : [];
}

export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  return err.message;
}

export function dealLink(dealId: number, tab?: string): string {
  return tab && tab !== "overview" ? `/deals/${dealId}?tab=${tab}` : `/deals/${dealId}`;
}

// Gate "where" values name a tab; KYC and the client live elsewhere on the overview.
export function tabForWhere(where: string): string {
  return ["overview", "risk", "markets", "quotes", "documents", "activity", "commission"].includes(where) ? where : "overview";
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : `${iso.replace(" ", "T")}Z`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((t - today) / 86400000);
}

// An open deal with no activity and no stage move for staleDays days.
export function isStale(deal: Pick<DealRow, "stage" | "last_activity_at" | "stage_entered_at" | "created_at">, staleDays: number): boolean {
  if (deal.stage === "Won" || deal.stage === "Lost") return false;
  const ages = [daysSince(deal.last_activity_at), daysSince(deal.stage_entered_at ?? deal.created_at)].filter((d): d is number => d !== null);
  return ages.length > 0 && Math.min(...ages) >= staleDays;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// Percent in the UI, fraction in the API.
export const toPercent = (fraction: number | null | undefined) => Math.round((Number(fraction) || 0) * 10000) / 100;
export const toFraction = (percent: string | number) => String((Number(percent) || 0) / 100);
