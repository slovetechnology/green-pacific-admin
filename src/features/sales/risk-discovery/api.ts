// Risk discovery (backend modules/sales/risk-discovery): deal questionnaires, client loss history and the policies
// a client holds elsewhere.
import type { FieldSpec } from "@/features/underwriting/policies/components/schedules/types";

export interface QuestionnaireSection {
  /** Sections with the same key answer into one object (the class schedule's sections all use "schedule"). */
  key: string;
  title: string;
  hint?: string;
  fields: FieldSpec[];
}

export type QuestionnaireAnswers = Record<string, Record<string, unknown>>;

export interface DealQuestionnaire {
  dealId: number;
  classOfBusiness: string | null;
  template: { id: number; code: string; version: number; title: string; scheduleKey: string | null; sections: QuestionnaireSection[] };
  status: "Not Started" | "Draft" | "Complete";
  answers: QuestionnaireAnswers;
  errors: { path: string; message: string }[];
  completedBy: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  newerVersion: boolean;
  stale: { templateCode: string; status: string } | null;
  editable: boolean;
}

export interface LossRow {
  id: number;
  client_id: number;
  deal_id: number | null;
  class_of_business: string;
  period_start: string;
  period_end: string;
  insurer_name: string | null;
  claims_count: number;
  premium: number;
  paid: number;
  outstanding: number;
  incurred: number;
  largest_loss: number;
  loss_ratio: number | null;
  description: string | null;
  source: string;
}

export interface LossHistory {
  rows: LossRow[];
  summary: { class_of_business: string; periods: number; claims: number; premium: number; incurred: number; loss_ratio: number | null }[];
  sources: string[];
}

export interface ExpiringPolicy {
  id: number;
  client_id: number;
  client_name?: string | null;
  insurer_id: number | null;
  insurer_name: string | null;
  current_broker: string | null;
  policy_no: string | null;
  class_of_business: string;
  sum_insured: number | null;
  premium: number | null;
  start_date: string | null;
  expiry_date: string;
  notes: string | null;
  status: "Open" | "Deal Opened" | "Closed";
  renewal_deal_id: number | null;
  days_to_expiry: number | null;
  deal: { id: number; deal_name: string; stage: string } | null;
}

export const lossHistoryUrl = (clientId: number) => `/api/risk-discovery/clients/${clientId}/loss-history`;
export const expiringUrl = (clientId: number) => `/api/risk-discovery/clients/${clientId}/expiring-policies`;
