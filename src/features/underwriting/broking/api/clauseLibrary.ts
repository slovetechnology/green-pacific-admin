import { api } from "@/shared/api/client";
import type { ClauseLibraryEntry } from "./brokingSlips";

export type { ClauseLibraryEntry };

export const CLAUSE_TYPES = ["Clause", "Condition", "Extension", "Exclusion", "Exception", "Warranty", "Endorsement"] as const;
export type ClauseType = (typeof CLAUSE_TYPES)[number];

export interface ClauseLibraryFilters {
  clauseType?: string;
  classOfBusiness?: string;
  status?: string;
  search?: string;
}

export interface ClauseLibraryPayload {
  code: string;
  title: string;
  clauseType: ClauseType;
  wording: string;
  description?: string;
  classOfBusiness?: string;
  product?: string;
  riskType?: string;
  coverage?: string;
  insurerId?: number | null;
  jurisdiction?: string;
  policyVersion?: string;
  priority?: number;
  isMandatory?: boolean;
  status?: "Active" | "Retired" | "Draft";
}

export async function fetchClauseLibrary(filters: ClauseLibraryFilters = {}): Promise<ClauseLibraryEntry[]> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const res = await api.get<{ entries: ClauseLibraryEntry[] }>(`/api/clause-library?${query.toString()}`);
  return res.entries;
}

export async function createClauseLibraryEntry(payload: ClauseLibraryPayload): Promise<ClauseLibraryEntry> {
  const res = await api.post<{ entry: ClauseLibraryEntry }>("/api/clause-library", payload);
  return res.entry;
}

export async function updateClauseLibraryEntry(id: number, payload: Partial<ClauseLibraryPayload>): Promise<ClauseLibraryEntry> {
  const res = await api.put<{ entry: ClauseLibraryEntry }>(`/api/clause-library/${id}`, payload);
  return res.entry;
}

export interface DraftRefreshResult {
  applied: boolean;
  totalDrafts: number;
  changedSlips: number;
  removedClauses: number;
  addedClauses: number;
  changes: Array<{ slipId: number; slipNumber: string; classOfBusiness: string; removed: number; added: number }>;
}

// Previews (apply false) or performs the re-pick of clauses on every Draft slip. Administrators only.
export async function refreshDraftSlipClauses(apply: boolean): Promise<DraftRefreshResult> {
  return api.post<DraftRefreshResult>("/api/clause-library/refresh-drafts", { apply });
}

export async function retireClauseLibraryEntry(id: number): Promise<ClauseLibraryEntry> {
  const res = await api.delete<{ entry: ClauseLibraryEntry }>(`/api/clause-library/${id}`);
  return res.entry;
}

// Hosts a reference page may be imported from.
export async function fetchExternalSources(): Promise<string[]> {
  const res = await api.get<{ hosts: string[] }>("/api/clause-library/external-sources");
  return res.hosts;
}

// Pulls a web page in as a Draft reference entry. It stays out of policies until a person rewrites and activates it.
export async function importExternalReference(url: string, classOfBusiness?: string): Promise<{ entry: ClauseLibraryEntry; created: boolean }> {
  return api.post<{ entry: ClauseLibraryEntry; created: boolean }>("/api/clause-library/import-external", { url, classOfBusiness });
}
