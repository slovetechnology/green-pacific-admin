// The insurers approached on a deal, one market each (backend modules/sales/pipeline/dealMarkets.js).

export type MarketStatus = "Draft" | "Sent" | "Acknowledged" | "Quoted" | "Declined" | "Withdrawn" | "Expired";

export interface MarketEvent {
  id: number;
  event: "Created" | "Status" | "Chased" | "Note";
  from_status: MarketStatus | null;
  to_status: MarketStatus | null;
  note: string | null;
  actor: string | null;
  created_at: string;
}

export interface Market {
  id: number;
  deal_id: number;
  insurer_id: number;
  insurer_name: string;
  insurer_email: string | null;
  status: MarketStatus;
  slip_id: number | null;
  quote_id: number | null;
  sent_at: string | null;
  sent_via: string | null;
  sent_to: string | null;
  chase_on: string | null;
  chase_count: number;
  last_chased_at: string | null;
  responded_at: string | null;
  declined_reason_code: string | null;
  declined_reason: string | null;
  declined_reason_label: string | null;
  notes: string | null;
  days_out: number | null;
  turnaround_days: number | null;
  chase_due: boolean;
  next_statuses: MarketStatus[];
  quote?: { id: number; premium: number; status: string; quote_reference: string | null } | null;
  events?: MarketEvent[];
}

export interface DealMarkets {
  markets: Market[];
  summary: { total: number; approached: number; awaiting: number; chaseDue: number; byStatus: Record<MarketStatus, number> };
  slips: { id: number; slip_number: string; slip_type: string; status: string }[];
  declineReasons: { code: string; label: string }[];
  sentVia: string[];
  emailReady: boolean;
  chaseDays: number;
  editable: boolean;
}

export interface ChaseDueRow extends Market {
  deal: { id: number; deal_name: string; stage: string; class_of_business: string };
  client_name: string | null;
}

export interface ResponseRow {
  insurer_id: number;
  insurer_name: string | null;
  approached: number;
  quoted: number;
  declined: number;
  awaiting: number;
  expired: number;
  withdrawn: number;
  reasons: Record<string, number>;
  quote_ratio: number | null;
  avg_turnaround_days: number | null;
}

export interface MarketResponses {
  from: string;
  to: string;
  totals: { approached: number; quoted: number; declined: number; awaiting: number; expired: number };
  byInsurer: ResponseRow[];
  declineReasons: { code: string; label: string; count: number }[];
  reasons: { code: string; label: string }[];
}

export const marketsKey = (dealId: number) => ["deals", String(dealId), "markets"];
export const marketsUrl = (dealId: number) => `/api/deals/${dealId}/markets`;
