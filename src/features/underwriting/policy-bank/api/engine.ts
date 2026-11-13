import { api, apiDownload, apiUrl } from "@/shared/api/client";
import type { Paged } from "./policyBank";

// Shapes returned by /api/policy-engine (backend modules/policybank/policyEngine*.js).
export const E = "/api/policy-engine";

export interface TxRow {
  id: number; policy_no: string | null; client_name: string; insurer_name: string; class_of_business: string | null;
  start_date: string | null; end_date: string | null; sum_insured: number | null; premium_due: number | null; status: string | null; parent_transaction_id: number | null;
}
export interface LimitChoice { code: string; amount?: number | null; percentage?: number | null; minimum_amount?: number | null }
export interface Selection { components?: string[]; limits?: (string | LimitChoice)[] }

export interface Issue { check: string; message: string; component?: string }
export interface Check { key: string; label: string; status: "pass" | "warn" | "fail"; messages: string[] }
export interface Validation {
  status: "READY" | "READY_WITH_WARNINGS" | "CANNOT_GENERATE"; ready: boolean; checks: Check[]; errors: Issue[]; warnings: Issue[];
  effective: {
    components: string[]; limits: string[]; addedByRules: { code: string; rule: string }[]; removedByRules: { code: string; rule: string }[];
    limitsAddedByRules: { code: string; rule: string }[]; firedRules: string[];
  };
  unresolved: { key: string; usedBy: string[] }[];
}
export interface ContextVariable {
  key: string; label: string; description?: string | null; type: string; required: boolean; source: "erp" | "input" | "derived" | null; entity: string; value: string | null; rawValue: unknown; editable: boolean;
}
export interface EngineContext {
  defaults: { components: string[]; limits: string[] }; variables: ContextVariable[];
  transaction: { id: number; policy_no: string | null; client: string | null; insurer: string | null; class: string | null }; asOf: string; insurerWordings: number; validation: Validation;
}
export interface PreviewEntry { code: string; name: string; type?: string; version?: string; source?: string; text: string; missing?: string[]; mandatory?: boolean; kind?: string; appliesTo?: string | null }
export interface Preview {
  validation: Validation; schedule: { key: string; label: string; value: string | null }[]; asOf: string;
  riskSchedule: { title: string; columns: { key: string; label: string; align?: string }[]; rows: Record<string, string | number | null>[]; total: number; count: number } | null;
  document: { sections: { key: string; title: string; entries: PreviewEntry[] }[]; limitSections: { key: string; title: string; entries: PreviewEntry[] }[]; missing: string[] };
}
export interface SuggestedProduct {
  id: number; code: string; name: string; class_name: string; group_name: string | null; matches_class: boolean;
  versions: { id: number; version: string; approval_status: string; effective_from: string | null; effective_to: string | null; insurer_id: number | null; requires_legal_review: number }[];
}
export interface Suggestions {
  transaction: { id: number; policy_no: string | null; class_of_business: string | null; start_date: string | null; end_date: string | null; client: string | null; insurer: string | null };
  matched: SuggestedProduct[]; others: SuggestedProduct[];
}
export interface Draft {
  approved_by?: string | null; approved_at?: string | null; issued_by?: string | null; issued_at?: string | null;
  id: number; transaction_id: number; product_version_id: number; kind: string; status: "Draft" | "Submitted" | "Approved" | "Issued" | "Superseded" | "Cancelled";
  policy_number: string | null; wording_version_label: string | null; amendment_no?: number; parent_issued_id?: number | null; meta?: { amendment?: { effectiveDate: string; reason: string }; renewal?: Record<string, unknown> }; selection?: Selection; inputs: Record<string, string>; created_by: string | null; submitted_by: string | null;
  validation?: Validation; policy_no?: string; product_name?: string; product_version?: string;
}
export interface DraftRow {
  id: number; transaction_id: number; policy_no: string | null; client: string | null; class_of_business: string | null; product_name: string | null; product_version: string | null;
  kind: string; status: string; created_by: string | null; submitted_by: string | null; approved_by: string | null; updated_at: string;
}

export interface WordDiff { type: "same" | "add" | "del"; text: string }
export interface ChangedWording {
  code: string; name: string; type: string; section: string; version: string; source: string;
  from: { version: string; source: string; text: string }; to: { version: string; source: string; text: string }; versionChanged: boolean; textChanged: boolean; wordDiff?: WordDiff[] | null;
}
export interface Diff {
  hasChanges: boolean; wording: { from: string; to: string } | null;
  components: { added: { code: string; name: string; section: string; version: string }[]; removed: { code: string; name: string; section: string; version: string }[]; changed: ChangedWording[] };
  limits: { added: { code: string; name: string; section: string; text: string }[]; removed: { code: string; name: string; section: string; text: string }[]; changed: { code: string; name: string; section: string; from: string; to: string }[] };
  details: { key: string; label: string; from: string | null; to: string | null }[];
  counts: { wordingsAdded: number; wordingsRemoved: number; wordingsChanged: number; limitsAdded: number; limitsRemoved: number; limitsChanged: number; details: number };
}
export interface DraftChanges {
  kind: "amendment" | "renewal"; amendmentNo: number; effectiveDate: string | null; reason: string | null;
  renewal: { fromProductVersion: string; toProductVersion: string; dropped: string[]; added: string[] } | null;
  parent: { id: number; policyNumber: string | null; status: string; issuedAt: string | null; snapshotSha256: string };
  diff: Diff; fingerprint: string; confirmation: { required: boolean; confirmed: boolean; by: string | null; at: string | null };
}
export interface ChainRow {
  id: number; kind: "new" | "amendment" | "renewal"; amendment_no: number; status: string; policy_number: string | null; transaction_id: number; parent_issued_id: number | null;
  effective_date: string | null; reason: string | null; issued_at: string | null; issued_by: string | null; current: boolean; documents: { format: string; document_version: number }[];
}
export interface RenewalCandidate { id: number; policy_no: string | null; class_of_business: string | null; business_type: string | null; start_date: string | null; end_date: string | null; premium_due: number | null; in_use: boolean; likely: boolean }
export interface RenewalSummary { fromVersion: string; toVersion: string; dropped: string[]; added: string[]; droppedLimits: string[]; addedLimits: string[] }

export interface IssuedRow {
  id: number; transaction_id: number; policy_number: string | null; client: string | null; kind: string; status: string; wording_version_label: string | null;
  created_by: string | null; submitted_by: string | null; approved_by: string | null; approved_at: string | null; issued_by: string | null; issued_at: string | null;
  amendment_no?: number; parent_issued_id?: number | null;
  snapshot_sha256: string | null; documents: { id: number; format: string; document_version: number }[];
}
export interface GeneratedDocument { id: number; issued_policy_id: number; format: "pdf" | "docx"; document_version: number; sha256: string | null; generated_by: string | null; generated_at: string }
export interface IssueResult { draft: Draft; sha256: string; documents: GeneratedDocument[]; documentError: string | null }
export interface ReviewPreview extends Preview { draft: Draft & { client?: string } }
export interface IssuedSnapshot { policy: { id: number; status: string; kind: string; policy_number: string | null }; intact: boolean; sha256: string; snapshot: Record<string, unknown> }

export interface EngineRequest { transactionId: number; productVersionId: number; selection?: Selection; inputs?: Record<string, string>; forIssue?: boolean }

export const engine = {
  transactions: (q: string) => api.get<{ transactions: TxRow[]; total: number }>(`/api/transactions?limit=8&q=${encodeURIComponent(q)}`),
  products: (transactionId: number) => api.get<Suggestions>(`${E}/products?transactionId=${transactionId}`),
  context: (r: EngineRequest) => api.post<EngineContext>(`${E}/context`, r),
  validate: (r: EngineRequest) => api.post<{ validation: Validation }>(`${E}/validate`, r),
  preview: (r: EngineRequest) => api.post<Preview>(`${E}/preview`, r),
  specimen: (r: EngineRequest, format: "pdf" | "docx") => apiDownload(`${E}/specimen`, { ...r, format }),
  draftChanges: (id: number) => api.get<DraftChanges>(`${E}/drafts/${id}/changes`),
  confirmChanges: (id: number) => api.post<DraftChanges>(`${E}/drafts/${id}/confirm-changes`, {}),
  amend: (id: number, body: { effectiveDate: string; reason: string }) => api.post<{ draft: Draft }>(`${E}/issued/${id}/amend`, body),
  renewalCandidates: (id: number) => api.get<{ candidates: RenewalCandidate[] }>(`${E}/issued/${id}/renewal-candidates`),
  renew: (id: number, transactionId: number) => api.post<{ draft: Draft; summary: RenewalSummary }>(`${E}/issued/${id}/renew`, { transactionId }),
  chain: (id: number) => api.get<{ chain: ChainRow[] }>(`${E}/issued/${id}/chain`),
  reviewDraft: (id: number) => api.get<ReviewPreview>(`${E}/drafts/${id}/preview`),
  approveDraft: (id: number) => api.post<{ draft: Draft }>(`${E}/drafts/${id}/approve`, {}),
  returnDraft: (id: number, reason: string) => api.post<{ draft: Draft }>(`${E}/drafts/${id}/return`, { reason }),
  issueDraft: (id: number, formats: ("pdf" | "docx")[]) => api.post<IssueResult>(`${E}/drafts/${id}/issue`, { formats }),
  issued: (query: string) => api.get<Paged<IssuedRow>>(`${E}/issued${query}`),
  issuedDocuments: (id: number) => api.get<{ documents: GeneratedDocument[] }>(`${E}/issued/${id}/documents`),
  issuedSnapshot: (id: number) => api.get<IssuedSnapshot>(`${E}/issued/${id}/snapshot`),
  generateDocument: (id: number, format: "pdf" | "docx") => api.post<{ document: GeneratedDocument }>(`${E}/issued/${id}/documents`, { format }),
  documentUrl: (docId: number) => apiUrl(`${E}/documents/${docId}/download`),
  drafts: (query: string) => api.get<Paged<DraftRow>>(`${E}/drafts${query}`),
  draft: (id: number) => api.get<{ draft: Draft }>(`${E}/drafts/${id}`),
  createDraft: (r: EngineRequest) => api.post<{ draft: Draft }>(`${E}/drafts`, r),
  saveDraft: (id: number, r: Partial<EngineRequest>) => api.put<{ draft: Draft }>(`${E}/drafts/${id}`, r),
  deleteDraft: (id: number) => api.delete<{ ok: boolean }>(`${E}/drafts/${id}`),
  submitDraft: (id: number) => api.post<{ draft: Draft }>(`${E}/drafts/${id}/submit`, {}),
};
