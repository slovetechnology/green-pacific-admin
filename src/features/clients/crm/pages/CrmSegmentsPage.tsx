import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid } from "@/shared/components/DataGrid";
import { fmtMoney } from "@/shared/lib/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CAMPAIGN_CHANNELS = ["Email", "SMS", "Newsletter", "Event", "Webinar", "Ad"];

interface ClientRow {
  id: number;
  name: string;
  client_ref: string | null;
  industry_naics: string | null;
  industry_sic: string | null;
  lifecycle_stage: string;
  total_premium: number;
  classes_list: string[];
}

interface Response {
  results: ClientRow[];
  tiers: [string, number, number | null][];
  classOptions: string[];
  lifecycleStages: string[];
}

export function CrmSegmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [campaignName, setCampaignName] = useState("");
  const [channel, setChannel] = useState("Email");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  const lifecycle = searchParams.get("lifecycle") ?? "Active Client";
  const industry = searchParams.get("industry") || "";
  const tier = searchParams.get("tier") || "";
  const renewalMonth = searchParams.get("renewal_month") || "";
  const coverageMode = searchParams.get("coverage_mode") || "has";
  const coverage = searchParams.get("coverage") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "segments", lifecycle, industry, tier, renewalMonth, coverageMode, coverage],
    queryFn: () =>
      api.get<Response>(
        `/api/crm/segments?lifecycle=${encodeURIComponent(lifecycle)}&industry=${encodeURIComponent(industry)}&tier=${encodeURIComponent(tier)}&renewal_month=${encodeURIComponent(renewalMonth)}&coverage_mode=${encodeURIComponent(coverageMode)}&coverage=${encodeURIComponent(coverage)}`
      ),
  });

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateCampaign() {
    if (!campaignName.trim() || checked.size === 0) {
      setError("Enter a campaign name and check at least one account.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const result = await api.post<{ campaignId: number }>("/api/campaigns/new-from-segment", {
        name: campaignName, channel, client_ids: [...checked].map(String),
      });
      setCreated(result.campaignId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  const results = data?.results || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Marketing Operations</p>
          <h1>Advanced Data Segmentation</h1>
        </div>
      </div>

      {created && (
        <div className="flash flash-success">
          Campaign created with {checked.size} recipient(s). <Link to={`/campaigns/${created}`}>View campaign →</Link>
        </div>
      )}

      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="lifecycle">Lifecycle</label>
            <select id="lifecycle" value={lifecycle} onChange={(e) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("lifecycle", e.target.value); return n; })}>
              <option value="">Any</option>
              {data?.lifecycleStages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="industry">Industry code (SIC/NAICS) contains</label>
            <input
              id="industry" placeholder="e.g. 484" defaultValue={industry}
              onBlur={(e) => setSearchParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set("industry", e.target.value); else n.delete("industry"); return n; })}
            />
          </div>
          <div className="field">
            <label htmlFor="tier">Premium tier</label>
            <select id="tier" value={tier} onChange={(e) => setSearchParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set("tier", e.target.value); else n.delete("tier"); return n; })}>
              <option value="">Any</option>
              {data?.tiers.map(([label]) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="renewal_month">Renewal month</label>
            <select id="renewal_month" value={renewalMonth} onChange={(e) => setSearchParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set("renewal_month", e.target.value); else n.delete("renewal_month"); return n; })}>
              <option value="">Any</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="coverage_mode">Coverage type</label>
            <select id="coverage_mode" value={coverageMode} onChange={(e) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("coverage_mode", e.target.value); return n; })}>
              <option value="has">Has coverage</option>
              <option value="lacks">Lacks coverage</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="coverage">Class of business</label>
            <input
              id="coverage" list="class-options" defaultValue={coverage}
              onBlur={(e) => setSearchParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set("coverage", e.target.value); else n.delete("coverage"); return n; })}
            />
            <datalist id="class-options">
              {data?.classOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{isLoading ? "…" : results.length} matching account(s)</h2>
        {error && <div className="flash flash-error">{error}</div>}
        <RoleGate need="write">
          <div className="toolbar">
            <input type="text" placeholder="New campaign name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} style={{ minWidth: 220 }} />
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CAMPAIGN_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button type="button" className="btn-secondary btn-sm" disabled={creating} onClick={handleCreateCampaign}>
              Create campaign from checked accounts →
            </button>
          </div>
        </RoleGate>
      </div>

      <DataGrid
        columns={[
          {
            key: "checkbox",
            header: "",
            render: (r: ClientRow) => (
              <RoleGate need="write">
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
              </RoleGate>
            ),
          },
          { key: "name", header: "Name", render: (r: ClientRow) => <Link to={`/clients/${r.id}`}>{r.name}</Link> },
          { key: "ref", header: "Ref", render: (r: ClientRow) => r.client_ref || "—" },
          { key: "industry", header: "Industry", render: (r: ClientRow) => r.industry_naics || r.industry_sic || "—" },
          { key: "lifecycle", header: "Lifecycle", render: (r: ClientRow) => <StatusBadge status={r.lifecycle_stage} /> },
          { key: "premium", header: "Total Premium", align: "right", render: (r: ClientRow) => fmtMoney(r.total_premium) },
          { key: "classes", header: "Classes Held", render: (r: ClientRow) => (r.classes_list.length ? r.classes_list.join(", ") : "—") },
        ]}
        rows={results}
        isLoading={isLoading}
        getRowKey={(r) => r.id}
        emptyMessage="No accounts match these filters."
      />
    </div>
  );
}
