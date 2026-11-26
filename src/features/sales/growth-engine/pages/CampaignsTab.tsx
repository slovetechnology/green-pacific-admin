// Tab 1: budget pacing and commission ROAS (GET /api/v1/ads/analytics), the conversion outbox with retry, and the
// forms to log daily spend (editors) and edit campaign targets (admins).
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "@/app/guards/RoleGate";
import { Modal } from "@/shared/components/exec/Modal";
import { ALERT_LABEL, api, naira, ratio, type Analytics, type CampaignRow, type CampaignTarget, type OutboxRow } from "../api";

const thisMonth = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 7);
const today = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className={`ge-kpi ${tone ? `is-${tone}` : ""}`}>
      <div className="ge-kpi-label">{label}</div>
      <div className="ge-kpi-value">{value}</div>
      {note ? <div className="ge-kpi-note">{note}</div> : null}
    </div>
  );
}

function BudgetBar({ pct }: { pct: number | null }) {
  const p = pct ?? 0;
  const tone = p > 100 ? "is-bad" : p > 85 ? "is-warn" : "";
  return (
    <div title={`${p.toFixed(1)}% of the monthly budget`}>
      <div className={`ge-bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)}><span style={{ width: `${Math.min(100, p)}%` }} /></div>
      <small className="muted">{pct === null ? "—" : `${p.toFixed(1)}%`}</small>
    </div>
  );
}

function VsTarget({ actual, target, lowerIsBetter, fmt }: { actual: number | null; target: number; lowerIsBetter: boolean; fmt: (n: number) => string }) {
  if (actual === null) return <span className="ge-tag is-muted">no data</span>;
  const good = lowerIsBetter ? actual <= target : actual >= target;
  return <span className={`ge-tag ${good ? "is-good" : "is-bad"}`} title={`Target ${fmt(target)}`}>{fmt(actual)}</span>;
}

export function CampaignsTab() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const [spendOpen, setSpendOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const analytics = useQuery({ queryKey: ["ads", "analytics", month], queryFn: () => api.get<Analytics>(`/analytics?month=${month}`), refetchInterval: 120_000 });
  const outbox = useQuery({ queryKey: ["ads", "outbox"], queryFn: () => api.get<OutboxRow[]>("/outbox"), refetchInterval: 120_000 });
  const retry = useMutation({
    mutationFn: (ids?: number[]) => api.post<{ requeued: number; sent?: number }>("/outbox/retry", ids ? { ids } : {}),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ads"] }),
  });

  const a = analytics.data;
  const t = a?.totals;
  return (
    <>
      <div className="ge-filters">
        <label className="muted small">Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} /></label>
        <RoleGate need="write"><button type="button" className="btn btn-primary" onClick={() => setSpendOpen(true)}>Log daily ad spend</button></RoleGate>
      </div>
      {analytics.error ? <p className="alert alert-danger">{errText(analytics.error)}</p> : null}
      {t ? (
        <div className="ge-kpis">
          <Kpi label="Spend vs monthly budget" value={naira(t.spend)} note={`of ${naira(t.budget)} (${t.budgetUsedPct ?? 0}%)`} tone={(t.budgetUsedPct ?? 0) > 100 ? "bad" : undefined} />
          <Kpi label="Bound brokerage commission" value={naira(t.commission)} note={`${t.bound} polic${t.bound === 1 ? "y" : "ies"} bound`} />
          <Kpi label="Blended commission ROAS" value={ratio(t.blendedRoas)} note={`target ${ratio(t.targetRoas)}`} tone={t.blendedRoas === null ? undefined : t.blendedRoas >= (t.targetRoas ?? 0) ? "good" : "bad"} />
          <Kpi label="Blended CPQL" value={naira(t.blendedCpql)} note={`${t.qualified} qualified of ${t.leads} leads · target ${naira(t.targetCpql)}`} />
          <Kpi label="Conversion outbox" value={`${a.outbox.SENT} sent`} note={`${a.outbox.PENDING} pending · ${a.outbox.FAILED} failed`} tone={a.outbox.FAILED ? "bad" : undefined} />
        </div>
      ) : analytics.isLoading ? <p className="muted">Loading…</p> : null}

      {a ? (
        <section className="card">
          <h2 className="card-title">Campaign matrix · {a.month}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th><th>Budget used</th><th className="ge-num">Spend</th><th className="ge-num">Qualified</th>
                  <th>CPQL vs target</th><th className="ge-num">Bound</th><th className="ge-num">Commission</th><th>ROAS vs target</th><th>Guardrails</th><th />
                </tr>
              </thead>
              <tbody>
                {a.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Campaign"><strong>{c.displayName}</strong><br /><small className="muted">{c.campaignCode} · {c.platform} · {c.segment}{c.isActive ? "" : " · paused"}</small></td>
                    <td data-label="Budget used"><BudgetBar pct={c.budgetUsedPct} /><small className="muted">of {naira(c.budget)}</small></td>
                    <td data-label="Spend" className="ge-num">{naira(c.spend)}</td>
                    <td data-label="Qualified" className="ge-num">{c.qualified} <small className="muted">/ {c.leads}</small></td>
                    <td data-label="CPQL vs target"><VsTarget actual={c.actualCpql} target={c.targetCpql} lowerIsBetter fmt={(n) => naira(n)} /> <small className="muted">≤ {naira(c.targetCpql)}</small></td>
                    <td data-label="Bound" className="ge-num">{c.bound}</td>
                    <td data-label="Commission" className="ge-num">{naira(c.commission)}</td>
                    <td data-label="ROAS vs target"><VsTarget actual={c.roas} target={c.targetRoas} lowerIsBetter={false} fmt={ratio} /> <small className="muted">≥ {ratio(c.targetRoas)}</small></td>
                    <td data-label="Guardrails">
                      {c.alerts.length ? c.alerts.map((al) => <span key={al} className={`ge-tag ${al === "PACING_FAST" ? "is-warn" : "is-bad"}`} style={{ marginRight: 4 }}>{ALERT_LABEL[al]}</span>) : <span className="ge-tag is-good">On track</span>}
                    </td>
                    <td><RoleGate need="admin"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Edit targets</button></RoleGate></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            CPQL is spend ÷ leads that reached Qualified Hot or Bound. ROAS is the brokerage commission of policies bound in the month (read from the ERP) ÷ spend.
            Alerts: CPQL above 1.35× target; spend above 85% of budget before the 22nd.
          </p>
        </section>
      ) : null}

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Conversion outbox</h2>
          <RoleGate need="write">
            <button type="button" className="btn btn-secondary btn-sm" disabled={retry.isPending || !outbox.data?.some((o) => o.status === "FAILED")} onClick={() => retry.mutate(undefined)}>
              Retry all failed
            </button>
          </RoleGate>
        </div>
        {retry.data ? <p className="alert alert-success" style={{ marginTop: 8 }}>{retry.data.requeued} requeued, {retry.data.sent ?? 0} sent.</p> : null}
        {retry.error ? <p className="alert alert-danger">{errText(retry.error)}</p> : null}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Lead</th><th>Platform</th><th>Stage</th><th className="ge-num">Value</th><th>Status</th><th>Last error</th><th /></tr></thead>
            <tbody>
              {(outbox.data || []).slice(0, 50).map((o) => (
                <tr key={o.id}>
                  <td data-label="Lead">{o.tracking_ref}<br /><small className="muted">{o.utm_campaign || "—"}</small></td>
                  <td data-label="Platform">{o.platform === "META_CAPI" ? "Meta CAPI" : "Google Data Manager"}</td>
                  <td data-label="Stage">{o.conversion_stage === "POLICY_BOUND" ? "Policy bound" : "Qualified lead"}</td>
                  <td data-label="Value" className="ge-num">{naira(o.commission_value, 2)}</td>
                  <td data-label="Status"><span className={`ge-tag ${o.status === "SENT" ? "is-good" : o.status === "FAILED" ? "is-bad" : "is-warn"}`}>{o.status}</span> <small className="muted">{o.retry_count ? `${o.retry_count} tries` : ""}</small></td>
                  <td data-label="Last error"><small>{o.last_error || "—"}</small></td>
                  <td>{o.status !== "SENT" ? <RoleGate need="write"><button type="button" className="btn btn-secondary btn-sm" disabled={retry.isPending} onClick={() => retry.mutate([o.id])}>Retry</button></RoleGate> : null}</td>
                </tr>
              ))}
              {outbox.data && !outbox.data.length ? <tr><td colSpan={7} className="muted">Nothing queued yet. Commercial leads that turn hot and leads that bind a policy appear here.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={spendOpen} title="Log daily ad spend" onClose={() => setSpendOpen(false)}>
        {spendOpen && a ? <SpendForm campaigns={a.campaigns} onDone={() => { setSpendOpen(false); void qc.invalidateQueries({ queryKey: ["ads"] }); }} /> : null}
      </Modal>
      <Modal open={Boolean(editing)} title={editing ? `Targets · ${editing.displayName}` : "Targets"} onClose={() => setEditing(null)}>
        {editing ? <TargetForm campaignId={editing.id} onDone={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ["ads"] }); }} /> : null}
      </Modal>
    </>
  );
}

function SpendForm({ campaigns, onDone }: { campaigns: CampaignRow[]; onDone: () => void }) {
  const [form, setForm] = useState({ metric_date: today(), campaign_code: campaigns[0]?.campaignCode ?? "", spend_ngn: "", clicks: "", impressions: "" });
  const save = useMutation({ mutationFn: () => api.post("/metrics", form), onSuccess: onDone });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form className="ge-form" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
      <label>Date<input type="date" value={form.metric_date} onChange={set("metric_date")} required /></label>
      <label>Campaign
        <select value={form.campaign_code} onChange={set("campaign_code")}>{campaigns.map((c) => <option key={c.id} value={c.campaignCode}>{c.displayName}</option>)}</select>
      </label>
      <label>Spend (₦)<input type="number" min={0} step="0.01" value={form.spend_ngn} onChange={set("spend_ngn")} required /></label>
      <label>Clicks<input type="number" min={0} step={1} value={form.clicks} onChange={set("clicks")} /></label>
      <label>Impressions<input type="number" min={0} step={1} value={form.impressions} onChange={set("impressions")} /></label>
      <p className="muted small" style={{ margin: 0 }}>Saving the same date and campaign again replaces that day's figures.</p>
      {save.error ? <p className="alert alert-danger">{errText(save.error)}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>Save spend</button>
    </form>
  );
}

function TargetForm({ campaignId, onDone }: { campaignId: number; onDone: () => void }) {
  const { data } = useQuery({ queryKey: ["ads", "campaigns"], queryFn: () => api.get<CampaignTarget[]>("/campaigns") });
  const target = data?.find((c) => c.id === campaignId);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? (target ? {
    display_name: target.display_name, monthly_budget_ngn: String(target.monthly_budget_ngn), target_cpql_ngn: String(target.target_cpql_ngn),
    target_commission_roas: String(target.target_commission_roas), is_active: String(Number(target.is_active) === 1),
  } : null);
  const save = useMutation({ mutationFn: () => api.put(`/campaigns/${campaignId}`, { ...values, is_active: values?.is_active === "true" }), onSuccess: onDone });
  if (!values) return <p className="muted">Loading…</p>;
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...values, [k]: e.target.value });
  return (
    <form className="ge-form" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
      <label>Display name<input type="text" value={values.display_name} onChange={set("display_name")} maxLength={150} required /></label>
      <label>Monthly budget (₦)<input type="number" min={0} step="0.01" value={values.monthly_budget_ngn} onChange={set("monthly_budget_ngn")} required /></label>
      <label>Target CPQL (₦)<input type="number" min={0} step="0.01" value={values.target_cpql_ngn} onChange={set("target_cpql_ngn")} required /></label>
      <label>Target commission ROAS (x)<input type="number" min={0} step="0.01" value={values.target_commission_roas} onChange={set("target_commission_roas")} required /></label>
      <label>Status
        <select value={values.is_active} onChange={set("is_active")}><option value="true">Active</option><option value="false">Paused</option></select>
      </label>
      {save.error ? <p className="alert alert-danger">{errText(save.error)}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>Save targets</button>
    </form>
  );
}
