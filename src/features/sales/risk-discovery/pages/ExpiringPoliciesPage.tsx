import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmDialog } from "@/shared/components/Dialogs";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import { ExpiringTable } from "../components/ClientRiskDiscoveryTab";
import type { ExpiringPolicy } from "../api";

// Policies clients hold with other insurers or brokers that expire soon and have no deal yet (backend
// risk-discovery/expiringPolicies.js listDueExpiringPolicies). Each is new business to quote for at its expiry.
// They are recorded on the client's "Risk discovery" tab.

const WINDOWS = [30, 60, 90, 120, 180, 365];

export function ExpiringPoliciesPage() {
  const { user } = useAuth();
  const canWrite = Boolean(user?.canWrite);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const within = WINDOWS.includes(Number(params.get("within"))) ? Number(params.get("within")) : 120;
  const withDeals = params.get("include") === "deal-opened";
  const key = ["risk-discovery", "expiring-due", within, withDeals];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ within: number; rows: ExpiringPolicy[] }>(`/api/risk-discovery/expiring-policies?within=${within}${withDeals ? "&include=deal-opened" : ""}`),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }

  async function openDeal(row: ExpiringPolicy) {
    if (!(await confirmDialog({ title: "Open a deal?", message: `This opens a new-business deal for ${row.client_name ?? "the client"}'s ${row.class_of_business} cover expiring ${row.expiry_date}.`, confirmLabel: "Open deal" }))) return;
    setBusy(`deal-${row.id}`);
    setMessage(null);
    try {
      const out = await api.post<{ deal: { id: number } }>(`/api/risk-discovery/expiring-policies/${row.id}/open-deal`, {});
      await queryClient.invalidateQueries({ queryKey: ["risk-discovery"] });
      navigate(`/deals/${out.deal.id}?tab=risk`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "The deal could not be opened.");
    } finally {
      setBusy(null);
    }
  }

  const rows = data?.rows ?? [];
  const open = rows.filter((r) => r.status === "Open");
  const premium = open.reduce((s, r) => s + (r.premium ?? 0), 0);
  const in30 = open.filter((r) => (r.days_to_expiry ?? 999) <= 30).length;
  const metrics: Metric[] = [
    { key: "open", label: "Without a deal", value: open.length },
    { key: "soon", label: "Within 30 days", value: in30, tone: in30 ? "warn" : "neutral" },
    { key: "premium", label: "Premium in play", value: fmtMoneyShort(premium), title: fmtMoney(premium) },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Business & Sales</span>
          <h1>Policies expiring elsewhere</h1>
        </div>
        <div className="exec-meta"><span>Cover clients hold with other insurers or brokers. Add them on a client's Risk discovery tab.</span></div>
      </header>
      <MetricStrip metrics={metrics} label="Expiring elsewhere summary" />
      <div className="exec-filters">
        <label className="exec-filter">
          <span>Expiring within</span>
          <select value={within} onChange={(e) => setParam("within", e.target.value === "120" ? null : e.target.value)}>
            {WINDOWS.map((w) => <option key={w} value={w}>{w} days</option>)}
          </select>
        </label>
        <label className="pl-check"><input type="checkbox" checked={withDeals} onChange={(e) => setParam("include", e.target.checked ? "deal-opened" : null)} /> Include ones with a deal</label>
      </div>
      <section>
        {message && <div className="flash flash-error" role="alert">{message}</div>}
        {isLoading && <p className="exec-state">Loading…</p>}
        {error && <p className="exec-state">The list could not be loaded.</p>}
        {data && rows.length === 0 && <p className="exec-state">Nothing expires in the next {within} days{withDeals ? "" : " without a deal"}.</p>}
        {rows.length > 0 && <ExpiringTable rows={rows} canWrite={canWrite} busy={busy} showClient onOpenDeal={openDeal} />}
      </section>
    </div>
  );
}
