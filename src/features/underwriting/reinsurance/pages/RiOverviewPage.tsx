import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { bpsText, errorText, minorText, useReinsuranceStatus } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

interface Dash {
  asOf: string; year: string;
  stages: { status: string; treaty: number; facultative: number }[];
  billed: { currency: string; billings: number; gross_minor: number; due_minor: number; collected_minor: number; outstanding_minor: number; brokerage_minor: number }[];
  concentration: { currency: string; total_minor: number; top: { party_id: number; name: string; country: string | null; gross_minor: number; share_bps: number }[] }[];
  market: { currency: string; total_minor: number; groups: { name: string; gross_minor: number; share_bps: number }[] }[];
  claims: { currency: string; open: number; paid_minor: number; outstanding_minor: number }[];
  cashCallsOpen: { currency: string; n: number }[];
  expiringTreaties: { id: number; treaty_ref: string; name: string; period_end: string; cedant: string }[];
  approvalsWaiting: Record<string, number>;
  ageing: { currency: string; kind: string; total_minor: number; buckets: { label: string; minor: number }[] }[];
  alerts: { billing_id: number; billing_ref: string; severity: string; kind: string; message: string }[]; alertCount: number;
  fx: { currency: string; latest: string | null; stale: boolean }[];
  partyAttention: { id: number; name: string; party_type: string; kyc_status: string; kyc_expiry: string | null; sanctions_status: string }[];
}
interface Integrity { ok: boolean; checkedAt: string; checks: { name: string; description: string; ok: boolean; problemCount: number; problems: string[] }[] }

const LABELS: Record<string, string> = { placements: "Bind and sign requests", remittances: "Payments to reinsurers", brokerageTransfers: "Brokerage transfers", setoffs: "Set-offs", manualJournals: "Manual journals", mappings: "Ledger mappings", commissionCalculations: "Commission calculations" };

function Bar({ bps }: { bps: number }) {
  return <div style={{ background: "var(--border)", borderRadius: 3, height: 8, minWidth: 80 }}><div style={{ width: `${Math.min(100, bps / 100)}%`, background: "var(--accent, #1b7a4d)", height: 8, borderRadius: 3 }} /></div>;
}

// One screen for where the book stands: pipeline, money, concentration, claims, and what needs someone.
export function RiOverviewPage() {
  const { can, isLoading } = useReinsuranceStatus();
  const q = useQuery({ queryKey: ["ri", "dashboard"], queryFn: () => api.get<Dash>("/api/reinsurance/dashboard"), enabled: can("ri.view") });
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  if (q.isLoading || isLoading) return <p>Loading…</p>;
  const d = q.data;
  if (q.error || !d) return <div className="flash flash-error">{errorText(q.error)}</div>;
  const waiting = Object.entries(d.approvalsWaiting).filter(([k, n]) => k !== "total" && n > 0);
  const staleFx = d.fx.filter((f) => f.stale);
  async function runIntegrity() {
    setError(null);
    try { setIntegrity(await api.get<Integrity>("/api/reinsurance/integrity")); } catch (e) { setError(errorText(e)); }
  }
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Overview</h1><p className="ri-note">As at {d.asOf}. Amounts stay in their own currency; nothing is converted or added across currencies here.</p></div>
        <div className="page-header-actions">
          <Link className="btn-secondary btn" to="/reinsurance/placements">Placements</Link>
          <Link className="btn-secondary btn" to="/reinsurance/accounts">Accounts</Link>
          <Link className="btn-secondary btn" to="/reinsurance/claims">Claims</Link>
          {can("ri.admin") && <button type="button" className="btn-secondary btn" onClick={runIntegrity}>Run integrity check</button>}
        </div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {integrity && (
        <div className={`flash flash-${integrity.ok ? "success" : "error"}`}>
          {integrity.ok ? `Integrity check passed (${integrity.checks.length} checks).` : "Integrity check found problems:"}
          {!integrity.ok && <ul>{integrity.checks.filter((c) => !c.ok).map((c) => <li key={c.name}><strong>{c.description}</strong> ({c.problemCount}): {c.problems.slice(0, 5).join("; ")}</li>)}</ul>}
        </div>)}

      {(waiting.length > 0 || d.alertCount > 0 || staleFx.length > 0 || d.partyAttention.length > 0) && (
        <div className="card"><h2>Needs attention</h2>
          {waiting.length > 0 && <p><strong>Waiting for a second person:</strong> {waiting.map(([k, n]) => `${LABELS[k] ?? k}: ${n}`).join(" · ")} — <Link to="/reinsurance/accounts">Accounts</Link>, <Link to="/reinsurance/approvals">Approvals</Link></p>}
          {d.alerts.map((a) => <p key={`${a.billing_id}-${a.kind}`} className={a.severity === "high" ? "flash flash-error" : "flash flash-warning"}><Link to={`/reinsurance/billings/${a.billing_id}`}>{a.billing_ref}</Link> · {a.kind}: {a.message}</p>)}
          {d.alertCount > d.alerts.length && <p className="ri-note">{d.alertCount - d.alerts.length} more on the Accounts page.</p>}
          {staleFx.length > 0 && <p className="flash flash-warning">Exchange rates out of date: {staleFx.map((f) => `${f.currency} (${f.latest ?? "none on record"})`).join(", ")}.</p>}
          {d.partyAttention.length > 0 && <p className="flash flash-warning">Parties whose KYC or sanctions status needs attention: {d.partyAttention.map((p) => <span key={p.id}><Link to={`/reinsurance/parties/${p.id}`}>{p.name}</Link> ({p.kyc_status !== "Verified" ? `KYC ${p.kyc_status}` : p.sanctions_status !== "Clear" ? `sanctions ${p.sanctions_status}` : `KYC expires ${p.kyc_expiry}`}) </span>)}</p>}
        </div>)}

      <div className="card"><h2>Placement pipeline</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Stage</th><th className="ri-num">Treaties</th><th className="ri-num">Facultative</th></tr></thead>
          <tbody>{d.stages.filter((s) => s.treaty + s.facultative > 0).map((s) => <tr key={s.status}><td>{s.status}</td><td className="ri-num">{s.treaty}</td><td className="ri-num">{s.facultative}</td></tr>)}
            {d.stages.every((s) => s.treaty + s.facultative === 0) && <tr><td colSpan={3}>Nothing in progress.</td></tr>}</tbody></table></div>
      </div>

      <div className="card"><h2>Premium billed in {d.year}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Currency</th><th className="ri-num">Billings</th><th className="ri-num">Gross premium</th><th className="ri-num">Brokerage</th><th className="ri-num">Due from cedants</th><th className="ri-num">Collected</th><th className="ri-num">Outstanding</th></tr></thead>
          <tbody>{d.billed.length === 0 && <tr><td colSpan={7}>No premium billed this year.</td></tr>}
            {d.billed.map((b) => <tr key={b.currency}><td>{b.currency}</td><td className="ri-num">{b.billings}</td><td className="ri-num">{minorText(b.gross_minor, b.currency)}</td><td className="ri-num">{minorText(b.brokerage_minor, b.currency)}</td><td className="ri-num">{minorText(b.due_minor, b.currency)}</td><td className="ri-num">{minorText(b.collected_minor, b.currency)}</td><td className="ri-num"><strong>{minorText(b.outstanding_minor, b.currency)}</strong></td></tr>)}</tbody></table></div>
      </div>

      {d.concentration.map((c) => (
        <div className="card" key={c.currency}><h2>Where {c.currency} premium goes</h2>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinsurer (top {c.top.length})</th><th>Country</th><th className="ri-num">Gross premium</th><th className="ri-num">Share</th><th /></tr></thead>
            <tbody>{c.top.map((t) => <tr key={t.party_id}><td><Link to={`/reinsurance/parties/${t.party_id}`}>{t.name}</Link></td><td>{t.country || "-"}</td><td className="ri-num">{minorText(t.gross_minor, c.currency)}</td><td className="ri-num">{bpsText(t.share_bps)}</td><td><Bar bps={t.share_bps} /></td></tr>)}</tbody></table></div>
          <p className="ri-note">By market: {d.market.find((m) => m.currency === c.currency)?.groups.map((g) => `${g.name} ${bpsText(g.share_bps)}`).join(" · ")}. This is the share of premium billed to cedants, by the reinsurers' market category on their party record.</p>
        </div>))}

      <div className="card"><h2>Claims and collections</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Currency</th><th className="ri-num">Open claims</th><th className="ri-num">Paid by cedants</th><th className="ri-num">Outstanding reserves</th><th className="ri-num">Cash calls open</th></tr></thead>
          <tbody>{d.claims.length === 0 && <tr><td colSpan={5}>No open claims.</td></tr>}
            {d.claims.map((c) => <tr key={c.currency}><td>{c.currency}</td><td className="ri-num">{c.open}</td><td className="ri-num">{minorText(c.paid_minor, c.currency)}</td><td className="ri-num">{minorText(c.outstanding_minor, c.currency)}</td><td className="ri-num">{d.cashCallsOpen.find((k) => k.currency === c.currency)?.n ?? 0}</td></tr>)}</tbody></table></div>
        {d.ageing.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>Debt ageing</th>{d.ageing[0].buckets.map((b) => <th key={b.label} className="ri-num">{b.label}</th>)}<th className="ri-num">Total</th></tr></thead>
          <tbody>{d.ageing.map((a) => <tr key={`${a.currency}${a.kind}`}><td>{a.kind} · {a.currency}</td>{a.buckets.map((b) => <td key={b.label} className="ri-num">{minorText(b.minor, a.currency)}</td>)}<td className="ri-num"><strong>{minorText(a.total_minor, a.currency)}</strong></td></tr>)}</tbody></table></div>}
      </div>

      <div className="card"><h2>Treaties ending within 90 days</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Treaty</th><th>Cedant</th><th>Ends</th></tr></thead>
          <tbody>{d.expiringTreaties.length === 0 && <tr><td colSpan={3}>None.</td></tr>}
            {d.expiringTreaties.map((t) => <tr key={t.id}><td><Link to={`/reinsurance/treaties/${t.id}`}>{t.treaty_ref}</Link> {t.name}</td><td>{t.cedant}</td><td>{t.period_end}</td></tr>)}</tbody></table></div>
        <p className="ri-note"><Link to="/reinsurance/renewals">Renewals due</Link></p>
      </div>
    </div>
  );
}
