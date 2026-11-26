// Shapes returned by /api/statutory-reports. These mirror what
// backend/src/lib/statutoryReports.js hydrates — the DB columns come back
// snake_case (they are the row) while everything inside `payload` is
// camelCase (it is JSON the lib builds), which is why this file mixes the
// two conventions rather than picking one.

export interface BrokerInfo {
  companyName: string;
  rcNumber: string;
  rbcNumber: string;
  licenceCategory: string;
  licenceExpiryDate: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  principalOfficer: string;
  tin?: string;
  mdCeo?: string;
  complianceOfficer?: string;
}

// ---- computed NAICOM returns (backend returns/returnRegistry.js) ----

export type ColumnType = "text" | "money" | "number" | "pct" | "date";
export interface ReturnColumn { key: string; label: string; type: ColumnType }
export type ReturnRow = Record<string, string | number | boolean | null>;
export interface TableSection { type: "table"; key: string; title: string; note?: string; columns: ReturnColumn[]; rows: ReturnRow[]; totals?: ReturnRow }
export interface KvSection { type: "kv"; key: string; title: string; note?: string; items: { label: string; value: string | number | null; type?: ColumnType }[] }
export type ReturnSection = TableSection | KvSection;
export interface Finding { level: "error" | "warning" | "info"; message: string }
export interface ReturnPeriod { frequency: string; year: number; index: number; label: string; start: string; end: string }
export interface ReturnOutput {
  code: string;
  name: string;
  category: string;
  period: ReturnPeriod;
  company: { name: string; licenceNo: string; rcNumber: string; address: string };
  generatedAt: string;
  sections: ReturnSection[];
  validations: Finding[];
  counts: { error: number; warning: number; info: number };
}
export interface CatalogEntry { code: string; name: string; category: string; frequencies: string[]; description: string }
export interface CatalogResponse { returns: CatalogEntry[]; frequencies: string[] }

export interface PremiumLine {
  policyNumber: string;
  clientName: string;
  insurerName: string;
  classOfBusiness: string;
  sumInsured: number;
  grossPremium: number;
  brokerageRate: number;
  // Only present when the rate stored on the transaction disagrees with
  // the money on the line — see brokerageRateFor() in the backend lib.
  storedBrokerageRate?: number;
  brokerageAmount: number;
  issLevy: number;
  netPremiumToInsurer: number;
  inceptionDate: string;
  expiryDate: string;
  isRenewal: boolean;
  creditNoteNo: string;
}

export interface PremiumRegister {
  lines: PremiumLine[];
  declarationText?: string;
  totalPolicies: number;
  totalSumInsured: number;
  totalGrossPremium: number;
  totalBrokerage: number;
  totalISSLevy: number;
  totalNetPremium: number;
}

export interface ClaimLine {
  claimNumber: string;
  clientName: string;
  insurerName: string;
  policyNumber: string;
  classOfBusiness: string;
  lossType: string;
  dateOfLoss: string;
  dateReported: string;
  dateSettled: string;
  status: string;
  claimedAmount: number;
  reserveAmount: number;
  incurredAmount: number;
  amountSettled: number;
  outstandingAmount: number;
  insurerClaimNo: string;
  dischargeVoucherNo: string;
  notifiedInMonth: boolean;
  settledInMonth: boolean;
}

export interface ClaimsRegister {
  lines: ClaimLine[];
  remarks?: string;
  totalClaims: number;
  claimsNotifiedInMonth: number;
  claimsSettledInMonth: number;
  claimsSettled: number;
  claimsRepudiated: number;
  claimsOutstanding: number;
  totalClaimedAmount: number;
  totalIncurredAmount: number;
  totalSettledAmount: number;
  totalOutstandingAmount: number;
  settlementRate: number;
}

export interface RemittanceLine {
  insurerName: string;
  premiumCollected: number;
  remittanceDate: string | null;
  amountRemitted: number;
  outstandingBalance: number;
  daysOutstanding: number;
  evidenceReference: string;
}

export interface InsurerRemittances {
  lines: RemittanceLine[];
  remarks?: string;
  totalPremiumCollected: number;
  totalAmountRemitted: number;
  totalOutstanding: number;
  remittanceCompliance: "Compliant" | "Non-compliant";
}

// The 15 manual-entry report types have no server-side schema — the lib's
// normalizePayload passes unknown keys through untouched — so their bodies
// are typed loosely and edited through the narrative form.
export interface ReportPayload {
  brokerInfo?: BrokerInfo;
  derivedAt?: string | null;
  filingReference?: string;
  premiumRegister?: PremiumRegister;
  claimsRegister?: ClaimsRegister;
  insurerRemittances?: InsurerRemittances;
  computed?: Record<string, ReturnOutput>;
  narrative?: Record<string, string>;
  [key: string]: unknown;
}

export interface StatutoryReport {
  id: number;
  report_type: string;
  report_frequency: string;
  report_code: string;
  report_title: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  reporting_year: number;
  reporting_month: number | null;
  reporting_quarter: number | null;
  status: string;
  submitted_at: string | null;
  submitted_by: string | null;
  acknowledged_at: string | null;
  naicom_reference: string | null;
  query_details: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  payload: ReportPayload;
  isOverdue: boolean;
  legalBasis: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  approved_hash: string | null;
  workflow_notes: string | null;
  schedules: string[];
  scheduleCounts: { error: number; warning: number; info: number };
  integrity: "intact" | "changed" | null;
  filingReference?: string | null;
}

export interface CalendarEntry {
  reportType: string;
  reportTitle: string;
  frequency: string;
  legalBasis: string;
  autoPopulated: boolean;
  period: number;
  periodLabel: string;
  reportCode: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  reportId: number | null;
  status: string;
  submittedAt: string | null;
  naicomReference: string | null;
  isOverdue: boolean;
}

export interface ComplianceStats {
  year: number;
  total: number;
  filed: number;
  accepted: number;
  queried: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  dueSoon: number;
  complianceRate: number;
}

export interface RegistryEntry {
  reportType: string;
  title: string;
  frequency: string;
  dueDays?: number;
  dueBeforeLicenceExpiry?: number;
  legalBasis: string;
  description: string;
  derivedFrom?: string;
  schedules: string[];
  autoPopulated: boolean;
  periodsPerYear: number;
}

export interface CalendarResponse {
  year: number;
  calendar: CalendarEntry[];
  stats: ComplianceStats;
}

export interface RegistryResponse {
  registry: RegistryEntry[];
  reportTypes: string[];
  frequencies: string[];
  statuses: string[];
  broker: BrokerInfo;
  canApprove: boolean;
}

export interface ReportResponse {
  report: StatutoryReport;
  canApprove?: boolean;
  sourcePeriod: { year: number; month: number; status: string };
}

// A report is editable in exactly the two states the backend's
// EDITABLE_STATUSES allows; everything else is read-only in the UI too.
export const EDITABLE_STATUSES = ["Draft", "Queried"];

export function isEditable(report: StatutoryReport): boolean {
  return EDITABLE_STATUSES.includes(report.status);
}

// ---- settings and registers ----

export interface StatutorySettings {
  company: Record<string, string>;
  compliance: Record<string, number>;
  fidelity: { insurer: string; policyNo: string; limit: number; expiry: string };
  classMapping: Record<string, string>;
  glMapping: Record<string, string>;
}
export interface NaicomClass { code: string; name: string; category: string }
export interface FsLine { code: string; name: string; statement: string; group: string }
export interface SettingsResponse { settings: StatutorySettings; profile: BrokerInfo; naicomClasses: NaicomClass[]; fsLines: FsLine[] }
export interface MappingsResponse {
  classes: { name: string; policies: number; naicomClass: string; mapped: boolean }[];
  accounts: { code: string; name: string; type: string; line: string | null; mapped: boolean }[];
  naicomClasses: NaicomClass[];
  fsLines: FsLine[];
}
export interface CorporateOfficer {
  id: number;
  name: string;
  role: "director" | "shareholder" | "both" | "officer";
  designation: string | null;
  nationality: string | null;
  shares_held: number;
  pct_holding: number;
  professional_qualification: string | null;
  appointed_on: string | null;
  ceased_on: string | null;
  notes: string | null;
}
export interface AmlFiling {
  id: number;
  filing_type: "CTR" | "STR";
  client_id: number | null;
  client_name: string | null;
  receipt_id: number | null;
  reference_no: string;
  transaction_date: string;
  filed_date: string;
  amount: number;
  grounds: string | null;
  created_by: string | null;
}

export type BankKind = "premium" | "claims" | "operating";
export interface BankAccountOption { id: number; code: string; name: string; is_active: number; kind: BankKind; trust: boolean }
export interface BankBalance {
  id: number;
  account_id: number;
  account_code: string | null;
  account_name: string | null;
  kind: BankKind | null;
  trust: boolean;
  as_at: string;
  statement_balance: number;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
}
