// Binding (backend modules/sales/binding): proposals, subjectivities, the instruction to bind and cover notes.

export interface Proposal {
  id: number;
  version: number;
  sheet_version: number | null;
  recommended_quote_id: number | null;
  status: "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired";
  cover_letter: string | null;
  valid_until: string | null;
  sent_at: string | null;
  sent_via: string | null;
  sent_to: string | null;
  responded_at: string | null;
  response_note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Subjectivity {
  id: number;
  quote_id: number | null;
  description: string;
  due_stage: "Bind" | "Issue" | "Date";
  due_on: string | null;
  status: "Open" | "Satisfied" | "Waived";
  resolution_note: string | null;
  closed_by: string | null;
  closed_at: string | null;
  overdue: boolean;
}

export interface PlacementLine {
  id: number;
  insurer_id: number;
  insurer_name: string;
  role: "Sole" | "Lead" | "Follower";
  share: number;
  quote_id: number | null;
  premium: number;
  sum_insured: number;
  commission_rate: number;
  transaction_id: number | null;
}

export interface BindInstruction {
  id: number;
  status: "Pending" | "Bound" | "Rejected" | "Withdrawn";
  instructed_by_name: string;
  channel: string;
  instructed_at: string;
  notes: string | null;
  debit_note_no: string | null;
  recorded_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  closed_reason: string | null;
  proposal_id: number | null;
  evidence: { id: number; title: string | null; doc_type: string } | null;
  layers: { layer_no: number; basis_quote_id: number; policy_no: string | null; premium: number; sum_insured: number; lines: PlacementLine[] }[];
  canApprove: boolean;
}

export interface BindingQuote {
  id: number;
  insurer_id: number;
  insurer_name: string;
  quote_reference: string | null;
  premium: number;
  commission_rate: number;
  currency: string;
  status: string;
  valid_until: string | null;
  line_offered: number;
  revision: number;
}

export interface BindInstructions {
  instructions: BindInstruction[];
  documents: { id: number; title: string | null; doc_type: string; deal_id: number | null; uploaded_at: string | null }[];
  contacts: { id: number; name: string; title: string | null; email: string | null }[];
  proposals: { id: number; version: number; status: string }[];
  quotes: BindingQuote[];
  channels: string[];
  gateOn: boolean;
  openAtBind: number;
  canRecord: boolean;
}

export interface CoverNote {
  id: number;
  cover_note_no: string;
  bind_instruction_id: number;
  deal_id: number;
  deal_name?: string;
  client_name?: string | null;
  transaction_id: number | null;
  insurer_name: string;
  valid_from: string;
  valid_to: string;
  status: "Issued" | "Superseded" | "Expired" | "Cancelled";
  status_note: string | null;
  issued_by: string | null;
  issued_at: string;
  days_left: number | null;
}

export const bindingUrl = (dealId: number, path: string) => `/api/deals/${dealId}/${path}`;
export const bindingKey = (dealId: number, part: string) => ["deals", String(dealId), "binding", part];
