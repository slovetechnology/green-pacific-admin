import { ApiError, apiFetch, apiUrl } from "@/shared/api/client";

export interface BrokingSlipMarketShare {
  id?: number;
  insurer_id?: number | null;
  insurer_name: string;
  role: "Leader" | "Follower" | "Co-Insurer" | "Reinsurer";
  written_line: number;
  signed_line: number;
  share_percentage: number;
  premium_share: number;
  status: "Pending" | "Written" | "Signed" | "Declined";
  underwriter_name?: string | null;
  reference_no?: string | null;
}

export interface BrokingSlipSubmission {
  id: number;
  recipient_type: string;
  recipient_name?: string;
  recipient_email?: string;
  submitted_by?: string;
  submitted_at: string;
  response_status: string;
  response_notes?: string;
  responded_at?: string | null;
  responded_by?: string | null;
}

/** One placement status move (brokingSlips.js recordSlipStatus). */
export interface BrokingSlipStatusStep {
  id: number;
  from_status: string | null;
  to_status: string;
  effective_date: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

/** What an insurer can say to a market submission (backend MARKET_RESPONSES). */
export const MARKET_RESPONSES = ["Pending", "Acknowledged", "Quoted", "Accepted", "Declined"] as const;
// Moves that need a reason (backend REASON_REQUIRED, plus the step back to Draft).
export const SLIP_REASON_STATUSES = ["Declined", "Cancelled", "Expired", "Draft"];

export interface BrokingSlipVersion {
  id: number;
  version: number;
  changed_by?: string;
  change_reason?: string;
  created_at: string;
}

export interface BrokingSlip {
  id: number;
  slip_number: string;
  slip_type: string;
  title: string;
  status: string;
  version: number;
  client_id?: number | null;
  client_name?: string;
  client_address?: string;
  client_city?: string;
  client_state?: string;
  transaction_id?: number | null;
  policy_no?: string;
  debit_note_no?: string;
  lead_insurer_name?: string;
  submission_id?: number | null;
  claim_id?: number | null;
  claim_no?: string;
  deal_id?: number | null;
  insurer_id?: number | null;
  class_of_business?: string;
  product?: string;
  risk_type?: string;
  coverage?: string;
  jurisdiction?: string;
  policy_version?: string;
  effective_date?: string;
  expiry_date?: string;
  sum_insured: number;
  limit_of_liability: number;
  deductible: number;
  premium: number;
  commission_rate: number;
  brokerage_amount: number;
  data: Record<string, any>;
  prepared_by?: string;
  reviewed_by?: string;
  approved_by?: string;
  prepared_at?: string;
  submitted_at?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  marketShares?: BrokingSlipMarketShare[];
  submissions?: BrokingSlipSubmission[];
  versions?: BrokingSlipVersion[];
  // Placement status history, newest first, and the moves allowed from the current status.
  statusHistory?: BrokingSlipStatusStep[];
  nextStatuses?: string[];
}

export interface BrokingSlipTemplateConfig {
  code: string;
  prefix: string;
  title: string;
  category: string;
  description: string;
  sections: Array<[string, string, string[]]>;
}

export interface BrokingSlipTemplatesResponse {
  types: Record<string, BrokingSlipTemplateConfig>;
  labels: Record<string, string>;
  statuses: string[];
}

export interface ClauseLibraryEntry {
  id: number;
  code: string;
  title: string;
  clause_type: "Clause" | "Extension" | "Exclusion" | "Endorsement" | "Warranty" | "Exception" | "Condition";
  wording: string;
  description?: string | null;
  class_of_business?: string | null;
  product?: string | null;
  risk_type?: string | null;
  coverage?: string | null;
  insurer_id?: number | null;
  jurisdiction?: string | null;
  policy_version?: string | null;
  priority?: number;
  isMandatory?: boolean;
  status?: "Active" | "Retired" | "Draft";
  source?: "Local" | "External";
  source_url?: string | null;
  specificity?: number;
  metadata?: Record<string, any>;
}

export interface ClauseLibrarySnapshot {
  criteria: Record<string, any>;
  resolvedAt: string;
  entries: Array<{
    id: number;
    code: string;
    title: string;
    clauseType: string;
    wording: string;
    description?: string | null;
    specificity?: number;
    isMandatory?: boolean;
    metadata?: Record<string, any>;
  }>;
}

export async function fetchBrokingSlipTemplates(): Promise<BrokingSlipTemplatesResponse> {
  return apiFetch<BrokingSlipTemplatesResponse>("/api/broking-slips/templates");
}

export async function resolveClauseLibrary(params: Record<string, string | number | undefined>): Promise<ClauseLibrarySnapshot> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const res = await apiFetch<{ snapshot: ClauseLibrarySnapshot }>(`/api/clause-library/resolve?${query.toString()}`);
  return res.snapshot;
}

export async function fetchAutoFillData(params: {
  clientId?: number;
  transactionId?: number;
  submissionId?: number;
  claimId?: number;
  dealId?: number;
  insurerId?: number;
}): Promise<Record<string, any>> {
  const query = new URLSearchParams();
  if (params.clientId) query.set("clientId", String(params.clientId));
  if (params.transactionId) query.set("transactionId", String(params.transactionId));
  if (params.submissionId) query.set("submissionId", String(params.submissionId));
  if (params.claimId) query.set("claimId", String(params.claimId));
  if (params.dealId) query.set("dealId", String(params.dealId));
  if (params.insurerId) query.set("insurerId", String(params.insurerId));

  const res = await apiFetch<{ data: Record<string, any> }>(`/api/broking-slips/auto-fill?${query.toString()}`);
  return res.data;
}

export async function fetchBrokingSlips(params: {
  clientId?: number;
  slipType?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ total: number; statusCounts?: Record<string, number>; items: BrokingSlip[] }> {
  const query = new URLSearchParams();
  if (params.clientId) query.set("clientId", String(params.clientId));
  if (params.slipType) query.set("slipType", params.slipType);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));

  return apiFetch<{ total: number; statusCounts?: Record<string, number>; items: BrokingSlip[] }>(`/api/broking-slips?${query.toString()}`);
}

export async function fetchBrokingSlip(id: number): Promise<BrokingSlip> {
  const res = await apiFetch<{ slip: BrokingSlip }>(`/api/broking-slips/${id}`);
  return res.slip;
}

export async function createBrokingSlip(payload: Partial<BrokingSlip> & { marketShares?: any[] }): Promise<BrokingSlip> {
  const res = await apiFetch<{ slip: BrokingSlip }>("/api/broking-slips", {
    method: "POST",
    body: payload,
  });
  return res.slip;
}

export async function updateBrokingSlip(
  id: number,
  payload: Partial<BrokingSlip> & { changeReason?: string; marketShares?: any[]; sumInsured?: number; commissionRate?: number | string; brokerageAmount?: number; changeReasonCode?: string; premium?: number }
): Promise<BrokingSlip> {
  const res = await apiFetch<{ slip: BrokingSlip }>(`/api/broking-slips/${id}`, {
    method: "PUT",
    body: payload,
  });
  return res.slip;
}

// Result of issuing the policy document when a slip linked to a policy is approved.
export interface PolicyDocument {
  id: number;
  slip_id: number;
  transaction_id: number;
  policy_number: string | null;
  revision: number;
  status: "Generated" | "Failed";
  error?: string | null;
  template_version?: number | null;
  generated_by?: string | null;
  generated_at?: string | null;
}

export interface PolicyDocumentResult {
  status: "Generated" | "Failed" | "Skipped";
  error?: string;
  warnings?: string[];
  policyDocument?: PolicyDocument;
}

export async function approveBrokingSlip(id: number): Promise<BrokingSlip & { policyResult?: PolicyDocumentResult | null }> {
  const res = await apiFetch<{ slip: BrokingSlip; policyDocument?: PolicyDocumentResult | null }>(`/api/broking-slips/${id}/approve`, {
    method: "POST",
  });
  return { ...res.slip, policyResult: res.policyDocument };
}

export interface ApprovePendingResult {
  approvedCount: number;
  failedCount: number;
  failed: { id: number; slip_number: string; error: string }[];
  documents: { Generated: number; Failed: number; Skipped: number };
}

/** Admin only: approve every Draft / Under Review slip. */
export async function approvePendingBrokingSlips(): Promise<ApprovePendingResult> {
  return apiFetch<ApprovePendingResult>("/api/broking-slips/approve-pending", { method: "POST" });
}

export async function fetchPolicyDocument(slipId: number): Promise<PolicyDocument | null> {
  try {
    const res = await apiFetch<{ policyDocument: PolicyDocument }>(`/api/broking-slips/${slipId}/policy-document`);
    return res.policyDocument;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Issues (or reissues, as a new revision) the policy document. A refusal comes back as the result, not a throw.
export async function generatePolicyDocument(slipId: number): Promise<PolicyDocumentResult> {
  try {
    return await apiFetch<PolicyDocumentResult>(`/api/broking-slips/${slipId}/policy-document`, { method: "POST" });
  } catch (err) {
    if (err instanceof ApiError && err.data && typeof err.data.status === "string") return err.data as unknown as PolicyDocumentResult;
    throw err;
  }
}

// The PDF as a blob. The page embeds it from an object URL because the API may sit on another site, where an
// <iframe src> would not carry the session cookie.
export async function fetchPolicyDocumentBlob(slipId: number): Promise<Blob> {
  const res = await fetch(apiUrl(`/api/broking-slips/${slipId}/policy-document/file`), { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data && typeof data.error === "string" && data.error ? data.error : "The policy document could not be loaded.");
  }
  return res.blob();
}

export async function recordMarketSubmission(id: number, payload: {
  recipientType?: string;
  recipientId?: number;
  recipientName?: string;
  recipientEmail?: string;
  responseStatus?: string;
  responseNotes?: string;
}): Promise<BrokingSlipSubmission> {
  const res = await apiFetch<{ submission: BrokingSlipSubmission }>(`/api/broking-slips/${id}/submissions`, {
    method: "POST",
    body: payload,
  });
  return res.submission;
}

export type ClauseGroup = "Clause" | "Warranty" | "Endorsement";

export interface PlacementPayload {
  placement: {
    slipId: number;
    slipReference: string;
    version: number;
    status: string;
    broker: { name: string; naicomRegistrationNo: string; rcNumber: string; address: string };
    insurer: { name: string; underwriter: string; participationPercent: number };
    client: {
      type: "" | "Individual" | "Corporate";
      legalName: string;
      rcNumber: string;
      idType: string;
      idNumber: string;
      tin: string;
      address: { street: string; city: string; lga: string; state: string };
      businessCategory: string;
    };
    clauses: Array<{ code: string; title: string; group: ClauseGroup; wording: string; mandatory: boolean; custom: boolean }>;
  };
  issues: Array<{ field: string; message: string }>;
}

export async function fetchPlacement(id: number): Promise<PlacementPayload> {
  return apiFetch<PlacementPayload>(`/api/broking-slips/${id}/placement`);
}

export function getBrokingSlipPdfUrl(id: number): string {
  return apiUrl(`/api/broking-slips/${id}/pdf`);
}

/** A placement step (PATCH /status): only the moves in nextStatuses; a reason where SLIP_REASON_STATUSES says. */
export async function moveSlipStatus(id: number, payload: { status: string; reason?: string; effectiveDate?: string }): Promise<BrokingSlip> {
  const res = await apiFetch<{ slip: BrokingSlip }>(`/api/broking-slips/${id}/status`, { method: "PATCH", body: payload });
  return res.slip;
}

/** Records the insurer's response to a market submission logged earlier. */
export async function updateSubmissionResponse(id: number, submissionId: number, payload: { responseStatus: string; responseNotes?: string }): Promise<BrokingSlipSubmission> {
  const res = await apiFetch<{ submission: BrokingSlipSubmission }>(`/api/broking-slips/${id}/submissions/${submissionId}`, { method: "PATCH", body: payload });
  return res.submission;
}
