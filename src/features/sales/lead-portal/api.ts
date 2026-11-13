// The Lead Portal's calls to /api/lead-portal, through the ERP's one fetch client (session cookie, CSRF
// token, typed ApiError), plus the shapes the API returns.
import { api as erpApi } from "@/shared/api/client";

const BASE = "/api/lead-portal";

export const api = {
  get: <T,>(path: string) => erpApi.get<T>(BASE + path),
  post: <T,>(path: string, body: unknown = {}) => erpApi.post<T>(BASE + path, body),
  put: <T,>(path: string, body: unknown) => erpApi.put<T>(BASE + path, body),
  patch: <T,>(path: string, body: unknown) => erpApi.patch<T>(BASE + path, body),
  del: <T,>(path: string) => erpApi.delete<T>(BASE + path),
};

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ------------------------------------------------------------------------------------ types

export interface Contact {
  kind: "email" | "phone";
  value: string;
  source: "listing" | "website" | "pattern";
  verified: boolean;
  note?: string;
}

export interface Lead {
  id: number;
  company: string;
  title: string;
  sourceKey: string;
  sourceName: string;
  sourceFamily: "tender" | "institutional" | "intent" | "mock";
  sourceLabel: string;
  url: string;
  sourceRef: string;
  summary: string;
  publishedAt: string | null;
  deadline: string | null;
  domain: string;
  sector: string;
  matchedKeywords: string[];
  trigger: string;
  riskCategory: string;
  score: number;
  contacts: Contact[];
  recommendation: string;
  discoveredAt: string;
  lastSeenAt: string;
  status: "new" | "shortlisted" | "dismissed";
  notes: string;
  digestId: number | null;
  dealId: number | null;
  convertedBy: string | null;
  convertedAt: string | null;
  sentAt: string | null;
  relevant?: boolean;
}

export interface Run {
  id: number;
  trigger_type: "schedule" | "manual" | "cli";
  started_by: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "partial" | "failed";
  seen: number;
  relevant: number;
  new_leads: number;
  errors: string | null;
  digest_id: number | null;
}

export interface SourceRun {
  id: number;
  run_id: number | null;
  source: string;
  ran_at: string;
  ok: number;
  found: number;
  kept: number;
  error: string | null;
}

export interface Digest {
  id: number;
  created_at: string;
  sent_at: string | null;
  recipients: string;
  lead_count: number;
  status: "pending" | "sent" | "failed";
  error: string | null;
  subject: string;
  sent_by: string | null;
  html_body?: string;
  text_body?: string;
  leads?: Lead[];
}

export interface Source {
  id: number;
  source_key: string;
  name: string;
  family: "tender" | "institutional";
  url: string;
  kind: "html" | "playwright" | "worldbank_api";
  item_selector: string;
  title_selector: string;
  link_selector: string;
  org_selector: string;
  ref_selector: string;
  date_selector: string;
  deadline_selector: string;
  wait_for: string;
  default_sector: string;
  enabled: number;
  notes: string | null;
  lastRun?: SourceRun | null;
}

export interface Keyword {
  id: number;
  label: string;
  weight: number;
  spellings: string[];
  risk_category: string;
  outreach_angle: string;
  active: number;
}

export interface WatchedCompany {
  id: number;
  name: string;
  sector: string;
  domain: string;
  active: number;
  notes: string | null;
}

export interface Settings {
  digest_recipients: string;
  digest_size: string;
  digest_window_hours: string;
  min_score: string;
  send_time: string;
  timezone: string;
  intent_providers: string;
  check_mx: string;
  crawl_contact_pages: string;
  send_empty_digest: string;
  daily_run: string;
  emailConfigured: boolean;
  emailFrom: string;
  intentApiConfigured: boolean;
}

export interface Dashboard {
  counts: { leads_total: number; leads_24h: number; shortlisted: number; converted: number; companies_sent: number; digests_sent: number };
  bySector: { sector: string; n: number }[];
  lastRun: Run | null;
  lastDigest: Pick<Digest, "id" | "sent_at" | "status" | "lead_count" | "subject" | "error"> | null;
  sources: SourceRun[];
  nextDigest: Lead[];
  running: boolean;
  settings: { sendTime: string; timeZone: string; digestSize: number; dailyRun: boolean };
}
