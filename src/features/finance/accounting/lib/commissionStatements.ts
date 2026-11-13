// Shapes for the commission statement pages (backend: lib/commissionStatements.js).
export type LineStatus = "Matched" | "Variance" | "Unmatched" | "Ambiguous" | "Ignored";

export interface StatementLine {
  id: number;
  rowNo: number | null;
  policyNo: string;
  clientName: string | null;
  premium: number | null;
  commission: number;
  transactionId: number | null;
  matchedPolicyNo: string | null;
  matchedClientName: string | null;
  matchedBillingMode: "Agency" | "Direct" | null;
  matchMethod: string | null;
  status: LineStatus;
  expected: number;
  variance: number;
  candidateIds: number[];
  note: string | null;
}

export interface CommissionStatement {
  id: number;
  insurer_id: number;
  insurer_name: string;
  statement_ref: string | null;
  period_start: string | null;
  period_end: string | null;
  statement_date: string | null;
  file_name: string | null;
  status: "Draft" | "Reconciled" | "Void";
  deposit_amount: number | null;
  deposit_date: string | null;
  deposit_reference: string | null;
  reconcile_note: string | null;
  reconciled_by: string | null;
  reconciled_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StatementDetail {
  statement: CommissionStatement;
  lines: StatementLine[];
  totals: {
    statement: number;
    expected: number;
    matchedLinesVariance: number;
    deposit: number | null;
    depositVsStatement: number | null;
    counts: Record<LineStatus, number>;
  };
}

export interface StatementListRow extends CommissionStatement {
  line_count: number;
  statement_total: number;
}

export interface Candidate {
  id: number;
  policy_no: string | null;
  trans_date: string | null;
  premium_due: number;
  total_brokerage: number;
  billing_mode: "Agency" | "Direct";
  parent_transaction_id: number | null;
  client_name: string;
}

export const LINE_STATUS_HELP: Record<LineStatus, string> = {
  Matched: "Matches a policy and the amount we expected (within ₦1).",
  Variance: "Matches a policy, but the amount differs from what our books expect.",
  Unmatched: "No policy with this number at this insurer. Match it by hand or ignore it.",
  Ambiguous: "Several policies share this number. Choose the right one.",
  Ignored: "Excluded from this statement, with a note.",
};
