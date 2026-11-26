// The Growth Engine's calls to /api/v1/ads, through the ERP's fetch client (session cookie, CSRF token, ApiError).
import { api as erpApi } from "@/shared/api/client";

const BASE = "/api/v1/ads";
export const api = {
  get: <T,>(path: string) => erpApi.get<T>(BASE + path),
  post: <T,>(path: string, body: unknown = {}) => erpApi.post<T>(BASE + path, body),
  put: <T,>(path: string, body: unknown) => erpApi.put<T>(BASE + path, body),
  patch: <T,>(path: string, body: unknown) => erpApi.patch<T>(BASE + path, body),
  del: <T,>(path: string) => erpApi.delete<T>(BASE + path),
};

export type Alert = "CPQL_EXCEEDED" | "PACING_FAST" | "BUDGET_EXCEEDED" | "ROAS_BELOW_TARGET";
export interface CampaignRow {
  id: number;
  campaignCode: string;
  displayName: string;
  platform: "GOOGLE" | "META" | "LINKEDIN";
  segment: "RETAIL" | "COMMERCIAL";
  isActive: boolean;
  clicks: number;
  impressions: number;
  spend: number;
  budget: number;
  budgetUsedPct: number | null;
  leads: number;
  qualified: number;
  actualCpql: number | null;
  targetCpql: number;
  bound: number;
  commission: number;
  roas: number | null;
  targetRoas: number;
  alerts: Alert[];
}
export interface Analytics {
  month: string;
  window: { first: string; last: string; dayOfMonth: number | null };
  totals: {
    budget: number; spend: number; budgetUsedPct: number | null; leads: number; qualified: number; bound: number; commission: number;
    blendedCpql: number | null; blendedRoas: number | null; targetRoas: number | null; targetCpql: number | null;
  };
  campaigns: CampaignRow[];
  outbox: Record<"PENDING" | "SENT" | "FAILED", number>;
}
export interface CampaignTarget {
  id: number;
  campaign_code: string;
  display_name: string;
  platform: string;
  segment: string;
  monthly_budget_ngn: number;
  target_cpql_ngn: number;
  target_commission_roas: number;
  is_active: number;
}
export interface OutboxRow {
  id: number;
  ad_lead_id: number;
  tracking_ref: string | null;
  utm_campaign: string | null;
  erp_policy_id: number | null;
  event_id: string;
  platform: "META_CAPI" | "GOOGLE_DATA_MANAGER";
  conversion_stage: "QUALIFIED_LEAD" | "POLICY_BOUND";
  commission_value: number;
  status: "PENDING" | "SENT" | "FAILED";
  retry_count: number;
  last_error: string | null;
  event_timestamp: string;
  sent_at: string | null;
}
export interface AdLead {
  id: number;
  tracking_ref: string;
  full_name: string | null;
  company_name: string | null;
  phone_e164: string;
  email: string | null;
  product_line: string;
  product_label: string;
  estimated_sum_insured: number;
  vehicle_or_asset_details: string | null;
  current_policy_expiry: string | null;
  renewal_reminder_stage: string;
  lead_score: number;
  qualification_status: "NEW" | "QUALIFYING" | "QUALIFIED_HOT" | "NURTURE" | "BOUND" | "LOST";
  channel: "WEB" | "WHATSAPP";
  ad_platform: string;
  utm_source: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  erp_client_id: number | null;
  erp_policy_id: number | null;
  deal_id: number | null;
  assigned_broker_id: number | null;
  created_at: string;
}
export interface ChatRow { id: number; channel: string; sender: "USER" | "BOT" | "BROKER"; message_text: string; extracted_json: Record<string, unknown> | null; created_at: string }
export interface LeadDetail { lead: AdLead; messages: ChatRow[]; underwriting: Record<string, unknown> | null; outbox: OutboxRow[]; suggestedClass: string }
export interface Status { whatsapp: boolean; whatsappWebhookSecured: boolean; brokerAlerts: boolean; deeplink: boolean; metaCapi: boolean; googleDataManager: boolean; languageModel: boolean }

export const naira = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const ratio = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(2)}x`);
export const ALERT_LABEL: Record<Alert, string> = {
  CPQL_EXCEEDED: "CPQL over 1.35× target",
  PACING_FAST: "Pacing fast",
  BUDGET_EXCEEDED: "Over budget",
  ROAS_BELOW_TARGET: "ROAS below target",
};
export const STATUS_TONE: Record<AdLead["qualification_status"], "good" | "warn" | "bad" | "muted"> = {
  NEW: "muted", QUALIFYING: "warn", QUALIFIED_HOT: "bad", NURTURE: "muted", BOUND: "good", LOST: "muted",
};
