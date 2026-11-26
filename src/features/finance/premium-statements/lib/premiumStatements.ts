// Types for /api/premium-statements (backend: modules/finance/premium-statements). Amounts are kobo.
export interface StatementRow {
  id: number;
  insurer_id: number;
  insurer_name: string;
  statement_ref: string | null;
  period_start: string | null;
  period_end: string | null;
  statement_date: string | null;
  file_name: string | null;
  status: "Open" | "Reconciled" | "Void";
  gross_cents: number;
  commission_cents: number;
  net_cents: number;
  line_count: number;
  open_exceptions?: number;
  created_by: string | null;
  created_at: string;
  reconcile_note?: string | null;
  void_reason?: string | null;
}

export interface StatementLine {
  id: number;
  row_no: number | null;
  policy_no: string;
  insured_name: string | null;
  debit_note_no: string | null;
  gross_cents: number | null;
  commission_cents: number | null;
  net_cents: number | null;
  transaction_id: number | null;
  match_status: "Matched" | "Discrepancy" | "Unmatched" | "Ambiguous" | "Ignored";
  match_method: string | null;
  candidates_json: string | null;
  expected_gross_cents: number | null;
  expected_commission_cents: number | null;
  expected_net_cents: number | null;
  note: string | null;
  client_name: string | null;
  matched_policy_no: string | null;
}

export interface ReconException {
  id: number;
  statement_id: number;
  line_id: number | null;
  transaction_id: number | null;
  insurer_id: number;
  insurer_name?: string;
  statement_ref?: string | null;
  policy_no: string | null;
  exception_type: string;
  label: string;
  expected_cents: number | null;
  actual_cents: number | null;
  difference_cents: number | null;
  status: "Open" | "Resolved" | "Waived" | "Superseded";
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface StatementDetail {
  statement: StatementRow;
  lines: StatementLine[];
  exceptions: ReconException[];
}

export interface Preview {
  insurer: { id: number; name: string };
  layout: string;
  layouts: { key: string; label: string }[];
  source: "detected" | "remembered";
  headerRow: number;
  headers: { col: number; text: string }[];
  mapping: Record<string, number>;
  fields: { key: string; label: string; required?: boolean }[];
  lineCount: number;
  sample: { rowNo: number; policyNo: string; insured: string | null; debitNote: string | null; gross: number | null; commission: number | null; net: number | null }[];
  errors: string[];
  errorCount: number;
}

export const kobo = (v: number | null | undefined) =>
  v == null ? "—" : `${v < 0 ? "-" : ""}₦${(Math.abs(v) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
