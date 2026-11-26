// /growth-engine: the AI Insurance Ad Campaigner's staff dashboard (signed in; every staff role reads, the API decides
// who may change what; agents never reach it). Tab 1: budget pacing and commission ROAS per campaign, the conversion
// outbox, daily spend and targets. Tab 2: the AI intake lead pipeline with transcripts and "Convert to ERP client".
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Tabs } from "@/shared/components/exec/Tabs";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import "@/shared/ads/ads.css";
import { api, type Status } from "../api";
import { CampaignsTab } from "./CampaignsTab";
import { LeadsTab } from "./LeadsTab";

const TABS = [
  { id: "campaigns", label: "Campaign Budget Pacing & Commission ROAS" },
  { id: "leads", label: "Live AI Intake & Lead Pipeline" },
];

function SetupStatus() {
  const { data } = useQuery({ queryKey: ["ads", "status"], queryFn: () => api.get<Status>("/status"), staleTime: 5 * 60_000 });
  if (!data) return null;
  const items: [string, boolean][] = [
    ["WhatsApp", data.whatsapp], ["Webhook signature", data.whatsappWebhookSecured], ["Broker alerts", data.brokerAlerts],
    ["wa.me link", data.deeplink], ["Meta CAPI", data.metaCapi], ["Google Data Manager", data.googleDataManager], ["AI model", data.languageModel],
  ];
  return (
    <div className="ge-status" aria-label="Integration set-up">
      {items.map(([label, on]) => (
        <span key={label} className={`ge-tag ${on ? "is-good" : "is-muted"}`} title={on ? "Configured" : "Not configured on the API (Render environment variables)"}>
          {on ? "✓" : "○"} {label}
        </span>
      ))}
    </div>
  );
}

export function GrowthEnginePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "leads" ? "leads" : "campaigns";
  return (
    <div className="ge">
      <div className="page-header">
        <div>
          <p className="eyebrow">Growth Engine</p>
          <h1>Ad Campaigns, Attribution &amp; Renewals</h1>
        </div>
      </div>
      <SetupStatus />
      <Tabs tabs={TABS} active={tab} idPrefix="ge" label="Growth Engine" onChange={(id) => setParams((p) => { p.set("tab", id); p.delete("lead"); return p; }, { replace: true })} />
      <div role="tabpanel" id={`ge-panel-${tab}`} aria-labelledby={`ge-tab-${tab}`} style={{ marginTop: "1rem" }}>
        {tab === "campaigns" ? <CampaignsTab /> : <LeadsTab />}
      </div>
    </div>
  );
}
