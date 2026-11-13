import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { bpsText, errorText, useReinsuranceStatus, type Renewal } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

const BUCKETS = ["Overdue", "30 days", "60 days", "90 days"];

// Treaties ending soon, with their loss ratio and where the renewal stands.
export function TreatyRenewalsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, isLoading } = useReinsuranceStatus();
  const [error, setError] = useState<string | null>(null);
  const days = [30, 60, 90, 180].includes(Number(params.get("days"))) ? Number(params.get("days")) : 90;
  const q = useQuery({ queryKey: ["ri", "renewals", days], queryFn: () => api.get<{ renewals: Renewal[] }>(`/api/reinsurance/renewals?days=${days}`), enabled: can("ri.view") });
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;

  async function renew(r: Renewal) {
    if (!window.confirm(`Renew ${r.treaty_ref} for the next period? A draft is created with this year's terms, and last year's reinsurers are invited.`)) return;
    setError(null);
    try {
      const res = await api.post<{ placementId: number }>(`/api/reinsurance/treaties/${r.treaty_id}/renew`, {});
      await qc.invalidateQueries({ queryKey: ["ri"] });
      navigate(`/reinsurance/placements/${res.placementId}`);
    } catch (e) { setError(errorText(e)); }
  }
  const rows = q.data?.renewals ?? [];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Treaty renewals</h1></div>
        <div className="page-header-actions"><Link className="btn-secondary btn" to="/reinsurance/treaties">All treaties</Link></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="toolbar">
        <select aria-label="Window" value={days} onChange={(e) => setParams({ days: e.target.value })}>
          {[30, 60, 90, 180].map((d) => <option key={d} value={d}>Ending within {d} days</option>)}</select>
        <span className="ri-note">{BUCKETS.map((b) => `${b}: ${rows.filter((r) => r.bucket === b).length}`).join(" · ")}</span>
      </div>
      <div className="card"><div className="table-wrap"><table className="data-table">
        <thead><tr><th>Treaty</th><th>Cedant</th><th>Class</th><th>Ends</th><th>Due</th><th className="ri-num">Latest loss ratio</th><th>Renewal</th><th /></tr></thead>
        <tbody>{!rows.length && <tr><td colSpan={8}>{q.isLoading ? "Loading…" : "No treaties are due for renewal in this window."}</td></tr>}
          {rows.map((r) => (
            <tr key={r.treaty_id}>
              <td><Link to={`/reinsurance/treaties/${r.treaty_id}`}>{r.treaty_ref}</Link><div className="ri-note">{r.name} · {r.treaty_type}</div></td>
              <td>{r.cedant_name}</td><td>{r.class_of_business || "—"}</td><td>{r.period_end}</td>
              <td><span className={`badge ${r.days_left < 0 ? "badge-declined" : r.days_left <= 30 ? "badge-warning" : "badge-secondary"}`}>{r.days_left < 0 ? `${-r.days_left} days overdue` : `${r.days_left} days`}</span></td>
              <td className="ri-num">{r.latest_loss_ratio_bps != null ? `${bpsText(r.latest_loss_ratio_bps)} (${r.latest_experience_year})` : "—"}</td>
              <td>{r.renewal ? <><Link to={`/reinsurance/treaties/${r.renewal.id}`}>{r.renewal.treaty_ref}</Link> <StatusBadge status={r.renewal.status} />
                {r.placement && <div className="ri-note"><Link to={`/reinsurance/placements/${r.placement.id}`}>{r.placement.placement_ref}</Link> · {r.placement.status}</div>}</> : "Not started"}</td>
              <td>{!r.renewal && can("ri.treaty.edit") && can("ri.placement.edit") && <button type="button" className="btn btn-sm" onClick={() => renew(r)}>Renew</button>}</td>
            </tr>))}</tbody></table></div></div>
    </div>
  );
}
