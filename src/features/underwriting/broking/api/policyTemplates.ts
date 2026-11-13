import { api } from "@/shared/api/client";

export interface PolicyTemplate {
  id: number | null;
  class_of_business?: string;
  title: string;
  preamble: string | null;
  operative_clause: string | null;
  footer_note: string | null;
  version: number;
  status?: "Active" | "Retired";
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface PolicyTemplatePayload {
  classOfBusiness?: string;
  title: string;
  preamble?: string;
  operativeClause?: string;
  footerNote?: string;
}

export async function fetchPolicyTemplates(): Promise<{ templates: PolicyTemplate[]; defaultTemplate: PolicyTemplate }> {
  return api.get("/api/policy-templates");
}

export async function createPolicyTemplate(payload: PolicyTemplatePayload): Promise<PolicyTemplate> {
  return (await api.post<{ template: PolicyTemplate }>("/api/policy-templates", payload)).template;
}

export async function updatePolicyTemplate(id: number, payload: PolicyTemplatePayload): Promise<PolicyTemplate> {
  return (await api.put<{ template: PolicyTemplate }>(`/api/policy-templates/${id}`, payload)).template;
}

export async function retirePolicyTemplate(id: number): Promise<PolicyTemplate> {
  return (await api.delete<{ template: PolicyTemplate }>(`/api/policy-templates/${id}`)).template;
}
