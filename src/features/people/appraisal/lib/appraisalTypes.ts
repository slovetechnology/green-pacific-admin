// Shapes returned by backend/src/routes/appraisal.js.

// Mirrors loadActor in backend lib/appraisals.js. Presentation only: the
// backend re-checks every request.
export function appraisalAccess(user: { isAdmin: boolean; appraisalRoles?: string[] } | null) {
  const roles = user?.appraisalRoles ?? [];
  const admin = Boolean(user?.isAdmin);
  const hr = admin || roles.includes("hr") || roles.includes("md");
  return {
    hr,
    flags: admin || roles.some((r) => ["hr", "md", "compliance"].includes(r)),
    appeals: hr || roles.includes("appeal_panel"),
    findings: admin || roles.some((r) => ["internal_audit", "compliance", "hr", "md"].includes(r)),
    board: hr || roles.includes("board_chair"),
    retention: admin || roles.includes("retention_reviewer") || roles.includes("hr"),
  };
}

export const APPRAISAL_STATUSES = [
  "Objectives", "Self Assessment", "Manager Review", "HR Moderation", "Calibration", "Sign-off", "Appeal Window", "Under Appeal", "Closed",
] as const;
// Fixed lists mirrored from backend lib/appraisals.js, so pages an agent
// uses don't need /meta (which agents can't reach).
export const APPEAL_GROUNDS = ["Factual error", "Procedure not followed", "Bias or discrimination"];
export const POTENTIAL_LEVELS = ["Low", "Medium", "High"];

// Probation reviews skip calibration and the appeal window.
export const PROBATION_STATUSES = ["Objectives", "Self Assessment", "Manager Review", "HR Moderation", "Sign-off", "Closed"] as const;

export interface AppraisalListRow {
  id: number;
  status: string;
  final_overall: number | null;
  final_band: number | null;
  cap_applied: number | null;
  cycle_id: number;
  cycle_name: string;
  cycle_status: string;
  employee_id: number;
  full_name: string;
  staff_no: string;
  job_title: string | null;
  role_family: string;
  department_name: string;
  reviewer_username: string | null;
}

export interface EvidenceItem {
  type: string;
  id: number | null;
  label: string;
  detail: string;
}

export interface KpiRow {
  objective_id: number;
  kpi_id: number;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  direction: "up" | "down";
  source_type: "auto" | "manual";
  scope_level: "individual" | "firm";
  weight: number;
  target_value: number | null;
  target_note: string | null;
  absolute_rule: boolean;
  band_rule: { type: string; bands: { min?: number; max?: number; score: number }[] } | null;
  min_volume: number;
  actual_value: number | null;
  numerator: number | null;
  denominator: number | null;
  volume: number | null;
  insufficient_data: boolean;
  note: string | null;
  entered_by: string | null;
  frozen: boolean;
  live: boolean;
  score: number | null;
  achievement: number | null;
  score_reason: string | null;
  evidence_count: number;
  evidence?: EvidenceItem[];
}

export interface Rating {
  score: number | null;
  comment: string | null;
}

export interface CompetencyRow {
  id: number;
  code: string;
  name: string;
  scope: "core" | "role";
  anchor_1: string;
  anchor_3: string;
  anchor_5: string;
  self: Rating | null;
  manager: Rating | null;
}

export interface ConductFlag {
  id: number;
  employee_id: number;
  cycle_id: number;
  severity: "Critical" | "Major" | "Moderate" | "Minor";
  category: string;
  description: string;
  evidence: string | null;
  status: "Suggested" | "Raised" | "Confirmed" | "Dismissed";
  source: "manual" | "erp_signal";
  raised_by: string;
  raised_at: string;
  employee_response: string | null;
  responded_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  full_name?: string;
  staff_no?: string;
  cycle_name?: string;
}

export interface Scores {
  kpi: number | null;
  competency?: number | null;
  conduct?: number | null;
  raw?: number | null;
  cap?: number | null;
  capReason?: string | null;
  final?: number | null;
  band?: number | null;
  bandLabel?: string | null;
  bonusMultiplier?: number | null;
  calibratedFrom?: number | null;
  calibrationReason?: string | null;
  weights: { kpi: number; competency: number; conduct: number };
  indicative: boolean;
}

export interface Cycle {
  id: number;
  name: string;
  cycle_type: "annual" | "probation";
  employee_id: number | null;
  period_start: string;
  period_end: string;
  self_due: string | null;
  manager_due: string | null;
  moderation_due: string | null;
  signoff_due: string | null;
  appeal_days: number;
  forced_distribution: number;
  status: "Planned" | "Open" | "Closed";
  n_appraisals?: number;
  n_closed?: number;
}

export interface Checkin {
  id: number;
  label: string;
  manager_comment: string;
  employee_comment: string | null;
  created_by: string;
  created_at: string;
  kpi_snapshot: { kpi_block: number | null; kpis: { code: string; name: string; unit: string; actual: number | null; target: number | null; score: number | null }[] };
}

export interface Adjustment {
  id: number;
  appraisal_id: number;
  objective_id: number;
  kpi_name: string;
  unit: string;
  original_value: number | null;
  proposed_value: number;
  reason: string;
  requested_by: string;
  requested_at: string;
  status: "Pending" | "Approved" | "Rejected";
  decision_note: string | null;
  decided_by: string | null;
  full_name?: string;
  cycle_name?: string;
}

export interface Appeal {
  id: number;
  appraisal_id: number;
  grounds: string;
  details: string;
  filed_by: string;
  filed_at: string;
  status: "Open" | "Decided";
  outcome: "Upheld" | "Amended" | "Re-review" | null;
  score_before: number | null;
  amended_score: number | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  full_name?: string;
  cycle_name?: string;
}

export interface PipSummary {
  id: number;
  status: "Active" | "Extended" | "Passed" | "Failed" | "Cancelled";
  start_date: string;
  end_date: string;
  reason: string;
}

export const PIP_STATUS_BADGE: Record<string, string> = {
  Active: "badge-open",
  Extended: "badge-pending",
  Passed: "badge-paid",
  Failed: "badge-failed",
  Cancelled: "badge-closed",
};

export interface AppraisalDetail {
  appraisal: {
    id: number;
    status: string;
    objectives_ack_at: string | null;
    self_summary: string | null;
    manager_summary: string | null;
    development_plan: string | null;
    ack_disagree: number | null;
    ack_comment: string | null;
    potential: string | null;
    probation_outcome: string | null;
    probation_extension_months: number | null;
    appeal_deadline: string | null;
    closed_at: string | null;
    self_submitted_at: string | null;
    manager_submitted_at: string | null;
    moderated_at: string | null;
    signed_off_at: string | null;
  };
  cycle: Cycle;
  employee: { id: number; staff_no: string; full_name: string; job_title: string | null; role_family: string; department_name: string; line_manager_name: string | null };
  reviewer: { id: number; username: string } | null;
  template: { id: number; role_family: string; version: number };
  kpis: KpiRow[];
  competencies: CompetencyRow[];
  scores: Scores;
  flags: ConductFlag[];
  transitions: { from_status: string | null; to_status: string; actor: string; comment: string | null; created_at: string }[];
  checkins: Checkin[];
  adjustments: Adjustment[];
  appeal: Appeal | null;
  pips: PipSummary[];
  relation: { isSelf: boolean; isReviewer: boolean; inChain: boolean; isHr: boolean; isPanel: boolean };
  permissions: {
    editObjectives: boolean;
    acknowledgeObjectives: boolean;
    selfRate: boolean;
    managerRate: boolean;
    enterManual: boolean;
    setReviewer: boolean;
    setPotential: boolean;
    calibrate: boolean;
    addCheckin: boolean;
    commentCheckins: boolean;
    requestAdjustment: number[];
    decideAdjustments: boolean;
    fileAppeal: boolean;
    decideAppeal: boolean;
    respondToFlags: boolean;
    probationOutcomes: string[];
    actions: { action: string; label: string; requiresComment: boolean }[];
  };
}

export interface AppraisalMeta {
  statuses: string[];
  flagSeverities: string[];
  flagCategories: string[];
  appealGrounds: string[];
  probationOutcomes: string[];
  potentialLevels: string[];
  pipProgress: string[];
  findingSources: string[];
  findingSeverities: string[];
  capabilities: { hr: boolean; flags: boolean; findings: { read: boolean; write: boolean }; hasEmployeeRecord: boolean };
  cycles: { id: number; name: string; status: string; cycle_type: string }[];
  employees: { id: number; staff_no: string; full_name: string; status: string; probation_end_date: string | null }[];
  departments: { id: number; name: string }[];
  reviewers: { id: number; username: string }[];
  colleagues: { id: number; username: string; full_name: string | null }[];
}

export interface FeedbackQuestion {
  key: string;
  type: "text" | "scale";
  text: string;
}

export interface FeedbackView {
  questions: FeedbackQuestion[];
  relationships?: string[];
  visible: boolean;
  minResponses: number;
  maxRequests?: number;
  counts?: { asked: number; submitted: number; declined: number; pending: number };
  summary?: { count: number; averages: Record<string, number>; comments: Record<string, string[]> } | null;
  requests?: { id: number; username: string | null; relationship: string; status: string; due_date: string | null }[];
  canRequest: boolean;
  closed?: boolean;
}

export interface HistoryView {
  employee: { id: number; full_name: string };
  cycles: {
    appraisal_id: number;
    cycle_name: string;
    period_end: string;
    kpi: number | null;
    competency: number | null;
    conduct: number | null;
    final: number | null;
    band: number | null;
    department_median: number | null;
    kpis: { code: string; name: string; score: number | null }[];
  }[];
}

export const STATUS_BADGE: Record<string, string> = {
  Objectives: "badge-draft",
  "Self Assessment": "badge-open",
  "Manager Review": "badge-in-review",
  "HR Moderation": "badge-review",
  Calibration: "badge-review",
  "Sign-off": "badge-pending",
  "Appeal Window": "badge-pending",
  "Under Appeal": "badge-warning",
  Closed: "badge-closed",
};

export const SEVERITY_BADGE: Record<string, string> = {
  Critical: "badge-failed",
  Major: "badge-high",
  Moderate: "badge-medium",
  Minor: "badge-low",
};

export const FLAG_STATUS_BADGE: Record<string, string> = {
  Suggested: "badge-draft",
  Raised: "badge-open",
  Confirmed: "badge-rejected",
  Dismissed: "badge-closed",
};

// Where an evidence item opens in the ERP (types with no page stay text).
export function evidenceLink(item: EvidenceItem): string | null {
  if (!item.id) return null;
  switch (item.type) {
    case "transaction":
      return `/transactions/${item.id}`;
    case "claim":
      return `/claims/${item.id}`;
    case "slip":
      return `/broking-slips/${item.id}`;
    case "client":
      return `/clients/${item.id}`;
    case "submission":
      return `/submissions/${item.id}`;
    case "deal":
      return `/deals/${item.id}`;
    case "statutory_report":
      return `/compliance/reports/${item.id}`;
    case "commission_statement":
      return `/commission-statements/${item.id}`;
    case "appraisal":
      return `/appraisal/${item.id}`;
    case "pip":
      return `/appraisal/pips/${item.id}`;
    case "employee":
      return `/org/employees/${item.id}`;
    case "message_thread":
      return `/client-messages/${item.id}`;
    case "support_message":
      return "/client-messages";
    default:
      return null;
  }
}

export function fmtScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : Number(value).toFixed(2);
}

export function fmtFigure(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  const text = Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (unit === "₦") return `₦${text}`;
  if (unit === "%") return `${text}%`;
  return `${text} ${unit}`;
}
