// Shapes of the /api/hr and /api/hr-admin responses (backend/src/modules/hr). Dates are YYYY-MM-DD text.

export type ExpiryBand = "expired" | 30 | 60 | 90 | "ok" | "none" | string;

export interface Paged<T> {
  rows: T[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

export interface Licence {
  id: number;
  employee_id: number;
  employee_name: string;
  staff_no: string;
  licence_type: string;
  regulator: string;
  licence_no: string;
  jurisdiction: string;
  status: string;
  issued_on: string | null;
  expires_on: string | null;
  evidence: string | null;
  notes: string | null;
  band: ExpiryBand;
}

export interface Appointment {
  id: number;
  employee_id: number;
  employee_name: string;
  insurer_id: number;
  insurer_name: string;
  agency_code: string | null;
  status: string;
  appointed_on: string | null;
  expires_on: string | null;
  terminated_on: string | null;
  notes: string | null;
  band: ExpiryBand;
}

export interface EoPolicy {
  id: number;
  scope: "Firm" | "Individual";
  employee_id: number | null;
  employee_name: string | null;
  insurer_name: string | null;
  policy_no: string;
  limit_per_claim: number;
  aggregate_limit: number;
  deductible: number;
  premium: number;
  currency: string;
  retroactive_date: string | null;
  starts_on: string;
  expires_on: string;
  status: string;
  notes: string | null;
  band: ExpiryBand;
}

export interface LoaType {
  id: number;
  code: string;
  name: string;
  category: string;
  is_active: number;
}

export interface EmployeeLoaRow {
  id: number;
  employee_id: number;
  loa_type_id: number;
  loa_name: string;
  loa_code: string;
  licence_id: number | null;
  granted_on: string | null;
  expires_on: string | null;
  status: string;
}

export interface CeCycle {
  id: number;
  name: string;
  body: string;
  starts_on: string;
  ends_on: string;
  required_hours: number;
  applies_to: "all" | "licensed";
  is_active: number;
}

export interface CeProgressRow {
  employee_id: number;
  employee_name: string | null;
  staff_no: string | null;
  completed: number;
  planned: number;
  required: number;
  shortfall: number;
  met: boolean;
}

export interface HrMeta {
  licenceTypes: string[];
  licenceStatuses: string[];
  appointmentStatuses: string[];
  loaStatuses: string[];
  eoStatuses: string[];
  loaTypes: LoaType[];
  cycles: CeCycle[];
  employees: { id: number; staff_no: string; full_name: string; role_family: string }[];
  insurers: { id: number; name: string }[];
}

type Tally = { expired: number; 30: number; 60: number; 90: number; ok: number };
export interface RegistrySummary {
  today: string;
  licences: Tally;
  appointments: Tally;
  eoPolicies: Tally;
  lapsedButActive: { licences: number; appointments: number; eoPolicies: number };
  unlicensedProducers: { id: number; full_name: string }[];
}

export interface CompProfile {
  id: number;
  code: string;
  name: string;
  base_commission_rate: number;
  peer_override_rate: number;
  notes: string | null;
  is_active: number;
  rules: BonusRule[];
}

export interface BonusRule {
  id: number;
  profile_id: number;
  insurer_id: number | null;
  insurer_name: string;
  basis: string;
  period: string;
  threshold: number;
  bonus_rate: number;
  bonus_amount: number;
  is_active: number;
}

export interface CompAssignment {
  id: number;
  employee_id: number;
  profile_id: number;
  base_salary_annual: number;
  effective_from: string;
  effective_to: string | null;
  reason: string;
  set_by: string | null;
  profile: CompProfile | null;
  rules?: BonusRule[];
}

export interface Asset {
  id: number;
  asset_tag: string;
  category: string;
  make: string | null;
  model: string | null;
  serial_no: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  status: string;
  notes: string | null;
  holder_id: number | null;
  holder_name: string | null;
  held_since: string | null;
}

export interface PersonProfile {
  employee: { id: number; staff_no: string; full_name: string; job_title: string | null; role_family: string; status: string };
  status: { licensed: boolean; licence: Licence | null; hasAnyLicence: boolean; lastExpired: string | null; eoCover: EoPolicy | null };
  licences: Licence[];
  loa: EmployeeLoaRow[];
  appointments: Appointment[];
  eoPolicies: EoPolicy[];
  ce: { cycle: CeCycle; progress: CeProgressRow | null } | null;
  assets: Asset[];
  comp?: CompAssignment | null;
}

export interface ReassignmentWarning {
  code: string;
  message: string;
}

export interface ReassignmentPreview {
  from: { id: number; username: string; producer: string | null };
  to: { id: number; username: string; producer: string | null };
  scope: "all" | "selected";
  effective: string;
  clients: { id: number; name: string; policies: number; premium: number }[];
  clientCount: number;
  policyCount: number;
  premiumTotal: number;
  warnings: ReassignmentWarning[];
  assetsHeld: { id: number; asset_tag: string; category: string }[];
}

export interface Reassignment {
  id: number;
  ref: string;
  from_user_id: number;
  to_user_id: number;
  from_username: string;
  to_username: string;
  scope: string;
  reason_code: string;
  reason: string;
  appraisal_id: number | null;
  effective_date: string;
  status: string;
  client_count: number;
  policy_count: number;
  premium_total: number;
  requested_by: string;
  approved_by: string | null;
  decision_note: string | null;
  executed_at: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
  clients?: { id: number; client_id: number; client_name: string; policies: number; premium: number }[];
}
