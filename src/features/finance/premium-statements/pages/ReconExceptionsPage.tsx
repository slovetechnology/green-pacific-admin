import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { kobo, type ReconException } from "../lib/premiumStatements";

/** The reconciliation exceptions ledger: every difference found on any insurer's premium statement. */
export function ReconExceptionsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "Open";
  const type = params.get("type") ?? "";
  const insurerId = params.get("insurer_id") ?? "";
  const qs = new URLSearchParams({ status, ...(type ? { type } : {}), ...(insurerId ? { insurer_id: insurerId } : {}) });
  const { data, isLoading } = useQuery({
    queryKey: ["premium-statements", "exceptions", qs.toString()],
    queryFn: () => api.get<{ exceptions: ReconException[]; types: { key: string; label: string }[] }>(`/api/premium-statements/exceptions?${qs}`),
  });
  const insurers = useQuery({ queryKey: ["premium-statements"], queryFn: () => api.get<{ insurers: { id: number; name: string }[] }>("/api/premium-statements") });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const rows = data?.exceptions ?? [];
  const totalDiff = rows.reduce((s, e) => s + (e.difference_cents ?? 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/premium-statements">Premium Statements</Link></p>
          <h1>Reconciliation Exceptions</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "75ch" }}>
            Every difference between an insurer's premium statement and our books. Entries are never deleted: each is resolved or waived
            once with a note (on its statement's page), or superseded when a line is re-matched.
          </p>
        </div>
      </div>
      <div className="card">
        <div className="toolbar">
          <select value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
            {["Open", "Resolved", "Waived", "Superseded", "all"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
          </select>
          <select value={type} onChange={(e) => set("type", e.target.value)} aria-label="Type">
            <option value="">All kinds</option>
            {(data?.types ?? []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={insurerId} onChange={(e) => set("insurer_id", e.target.value)} aria-label="Insurer">
            <option value="">All insurers</option>
            {(insurers.data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        {isLoading ? <p>Loading…</p> : (
          <>
            <p style={{ color: "var(--text-muted)" }}>{rows.length} exception{rows.length === 1 ? "" : "s"}; net difference {kobo(totalDiff)} (statement less our books).</p>
            <div className="table-wrap">
              <table className="data-grid-table">
                <thead><tr><th>Raised</th><th>Insurer</th><th>Statement</th><th>Policy</th><th>Exception</th><th className="num">Our books</th><th className="num">Statement</th><th className="num">Difference</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={9} style={{ color: "var(--text-muted)" }}>Nothing here.</td></tr>}
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td>{String(e.created_at).slice(0, 10)}</td>
                      <td>{e.insurer_name}</td>
                      <td><Link to={`/premium-statements/${e.statement_id}`}>{e.statement_ref || `#${e.statement_id}`}</Link></td>
                      <td>{e.transaction_id ? <Link to={`/transactions/${e.transaction_id}`}>{e.policy_no}</Link> : e.policy_no}</td>
                      <td>{e.label}</td>
                      <td className="num">{kobo(e.expected_cents)}</td>
                      <td className="num">{kobo(e.actual_cents)}</td>
                      <td className="num">{kobo(e.difference_cents)}</td>
                      <td><StatusBadge status={e.status} />{e.resolution_note && <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{e.resolution_note}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
