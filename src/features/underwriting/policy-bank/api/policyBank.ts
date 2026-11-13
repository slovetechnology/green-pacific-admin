import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// Shapes returned by /api/policy-bank (backend modules/policybank). Dates are YYYY-MM-DD text.

export const P = "/api/policy-bank";

export type ApprovalStatus = "Draft" | "Submitted" | "UnderReview" | "Approved" | "Rejected" | "Superseded" | "Expired" | "Deactivated";
export type WordingSource = "broker_master" | "insurer_specific" | "insurer_approved" | "transaction_specific";

export const COMPONENT_TYPES = [
  "definition", "insuring_clause", "coverage", "extension", "exclusion", "condition", "warranty", "clause",
  "endorsement", "special_condition", "claims_condition", "cancellation_condition", "renewal_condition",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const TYPE_LABEL: Record<string, string> = {
  definition: "Definition", insuring_clause: "Insuring clause", coverage: "Coverage", extension: "Extension", exclusion: "Exclusion",
  condition: "General condition", warranty: "Warranty", clause: "Clause", endorsement: "Endorsement", special_condition: "Special condition",
  claims_condition: "Claims condition", cancellation_condition: "Cancellation condition", renewal_condition: "Renewal condition",
};

// The wording screens: one page per group, each a filtered view of the same component list.
export const WORDING_GROUPS: Record<string, { label: string; path: string; types: ComponentType[]; createAs: ComponentType }> = {
  definitions: { label: "Definitions & insuring clauses", path: "definitions", types: ["definition", "insuring_clause"], createAs: "definition" },
  coverages: { label: "Coverages", path: "coverages", types: ["coverage"], createAs: "coverage" },
  conditions: { label: "Conditions", path: "conditions", types: ["condition", "special_condition", "claims_condition", "cancellation_condition", "renewal_condition"], createAs: "condition" },
  exclusions: { label: "Exclusions", path: "exclusions", types: ["exclusion"], createAs: "exclusion" },
  warranties: { label: "Warranties", path: "warranties", types: ["warranty"], createAs: "warranty" },
  extensions: { label: "Extensions", path: "extensions", types: ["extension"], createAs: "extension" },
  clauses: { label: "Clauses", path: "clauses", types: ["clause"], createAs: "clause" },
  endorsements: { label: "Endorsements", path: "endorsements", types: ["endorsement"], createAs: "endorsement" },
  all: { label: "All wordings", path: "all", types: [], createAs: "clause" },
};

export interface Paged<T> { rows: T[]; total: number; totalPages: number; page: number }

export interface PbClass { id: number; code: string; name: string; group_name: string | null; class_of_business: string | null; status: string; sort_order: number; product_count?: number }
export interface VersionSummary { id: number; component_id: number; insurer_id: number | null; version: string; source: WordingSource; approval_status: ApprovalStatus; effective_from: string | null; effective_to: string | null }
export interface PbProductVersion {
  id: number; product_id: number; insurer_id: number | null; version: string; wording_source: WordingSource; approval_status: ApprovalStatus;
  effective_from: string | null; effective_to: string | null; requires_legal_review: number; notes: string | null; created_by: string | null; approved_by: string | null; approved_at: string | null;
}
export interface PbProduct { id: number; class_id: number; code: string; name: string; description: string | null; status: string; versions: PbProductVersion[] }
export interface PbComponent {
  id: number; code: string; component_type: ComponentType; name: string; description: string | null; status: "Active" | "Deactivated"; versions: VersionSummary[];
}
export interface PbVersion extends VersionSummary {
  wording: string; description: string | null; owner: string | null; external_reference: string | null; requires_legal_review: number; supersedes_id: number | null;
  rejection_reason: string | null; created_by: string | null; submitted_by: string | null; approved_by: string | null; approved_at: string | null;
}
export interface ComponentDetail {
  component: PbComponent; versions: PbVersion[];
  dependencies: Dependency[]; requiredBy: Dependency[]; conflicts: Conflict[];
  usedIn: { product_version_id: number; version: string; approval_status: string; product_code: string; product_name: string }[];
}
export interface Dependency { id: number; component_id: number; requires_component_id: number | null; requires_variable_key: string | null; requires_value: string | null; message: string }
export interface Conflict { id: number; component_id: number; conflicts_with_component_id: number; unless_component_id: number | null; message: string }
export interface Variable { id: number; var_key: string; label: string; source_entity: string; source_field: string | null; data_type: string; required: number; description: string | null; status: string }
export interface Rule {
  id: number; code: string; name: string; description: string | null; product_id: number | null; status: "Draft" | "Active" | "Retired"; priority: number;
  condition: unknown; actions: unknown[]; created_by: string | null; approved_by: string | null; effective_from: string | null; effective_to: string | null;
}
export interface PvItem {
  link_id: number; component_id: number; code: string; name: string; component_type: ComponentType; section: string | null; mandatory: number; default_selected: number;
  version_id: number; version: string; source: WordingSource; approval_status: ApprovalStatus; requires_legal_review: number; wording?: string;
}
export interface PvLimit {
  id: number; kind: "limit" | "sub_limit" | "excess"; code: string; name: string; description: string | null; basis: string; amount: number | null; percentage: number | null;
  minimum_amount: number | null; currency: string; component_id: number | null; mandatory: number; default_selected: number;
}
export interface ProductVersionDetail {
  productVersion: PbProductVersion; product: PbProduct; items: PvItem[]; limits: PvLimit[]; rules: Rule[];
  summary: { components: number; notApproved: number };
}
export interface Me { permissions: string[]; roles: string[] }
export interface AuditRow { id: number; actor: string; action: string; entity_type: string; entity_id: number; summary: string | null; created_at: string; changes: Record<string, unknown> | null }
export interface ApprovalRow { id: number; subject_type: string; subject_id: number; action: string; actor: string; reason: string | null; created_at: string }

/** Builds ?a=1&b=2, leaving out blanks. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const pb = {
  get: <T,>(path: string) => api.get<T>(`${P}${path}`),
  post: <T,>(path: string, body?: unknown) => api.post<T>(`${P}${path}`, body ?? {}),
  put: <T,>(path: string, body?: unknown) => api.put<T>(`${P}${path}`, body ?? {}),
  del: <T,>(path: string) => api.delete<T>(`${P}${path}`),
};

/** The caller's Policy Bank permissions. Always answers; a person with no access gets an empty list. */
export function usePbAccess(enabled = true) {
  const query = useQuery({ queryKey: ["pb", "me"], queryFn: () => pb.get<Me>("/me"), staleTime: 60_000, enabled });
  const can = (permission: string) => Boolean(query.data?.permissions.includes(permission));
  return { me: query.data, isLoading: query.isLoading, can, hasAny: Boolean(query.data?.permissions.length) };
}

export const PB_TABS = [
  { to: "/policy-bank", label: "Overview", end: true },
  { to: "/policy-bank/builder", label: "Policy builder" },
  { to: "/policy-bank/issued", label: "Issued policies" },
  { to: "/policy-bank/classes", label: "Classes" },
  { to: "/policy-bank/products", label: "Products" },
  { to: "/policy-bank/wordings/all", label: "Wordings" },
  { to: "/policy-bank/insurer-wordings", label: "Insurer wordings" },
  { to: "/policy-bank/compare", label: "Compare insurers" },
  { to: "/policy-bank/variables", label: "Variables" },
  { to: "/policy-bank/rules", label: "Rules" },
  { to: "/policy-bank/links", label: "Dependencies & conflicts" },
  { to: "/policy-bank/approvals", label: "Approvals" },
  { to: "/policy-bank/audit", label: "Audit history" },
  { to: "/policy-bank/settings", label: "Settings" },
];
