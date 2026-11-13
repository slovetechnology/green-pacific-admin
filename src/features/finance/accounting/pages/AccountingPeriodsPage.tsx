import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";

interface Period {
  year: number;
  month: number;
  status: "Open" | "Closed";
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Accounting Periods (backend: finance/accounting-periods): closing a month stops every dated financial record
 * (policies, receipts, expenses, settlements, journals...) being written into it. A month with no row is open.
 * Closing all twelve is the first step of the year-end close.
 */
export function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["accounting-periods"], queryFn: () => api.get<{ periods: Period[] }>("/api/accounting-periods") });
  const byMonth = new Map((data?.periods ?? []).filter((p) => p.year === year).map((p) => [p.month, p]));
  const years = [...new Set([thisYear + 1, thisYear, thisYear - 1, thisYear - 2, ...(data?.periods ?? []).map((p) => p.year)])].sort((a, b) => b - a);

  async function setStatus(months: number[], status: "Open" | "Closed") {
    setBusy(true);
    setFlash(null);
    try {
      for (const m of months) await api.post(`/api/accounting-periods/${year}/${m}/status`, { status });
      setFlash({ ok: true, text: months.length === 1 ? `${MONTHS[months[0] - 1]} ${year} ${status === "Closed" ? "closed" : "reopened"}.` : `${months.length} months of ${year} closed.` });
      await queryClient.invalidateQueries({ queryKey: ["accounting-periods"] });
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "Could not change the period." });
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();
  const ended = (m: number) => year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth() + 1);
  const openEnded = MONTHS.map((_, i) => i + 1).filter((m) => ended(m) && byMonth.get(m)?.status !== "Closed");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Accounting Periods</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "70ch" }}>
            Close a month once its figures are final: nothing dated in a closed month can be added, changed or cancelled until it
            is reopened. Every change is in the audit log. Close all twelve months before the year-end close.
          </p>
        </div>
        <div className="page-header-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}
      <RoleGate need="write">
        {openEnded.length > 0 && (
          <div className="toolbar" style={{ marginBottom: "1rem" }}>
            <button type="button" className="btn btn-secondary" disabled={busy}
              onClick={() => { if (window.confirm(`Close ${openEnded.length} ended month(s) of ${year}?`)) void setStatus(openEnded, "Closed"); }}>
              Close all ended months of {year} ({openEnded.length})
            </button>
          </div>
        )}
      </RoleGate>
      <div className="card">
        {isLoading ? <p>Loading…</p> : (
          <div className="table-wrap">
            <table className="data-grid-table">
              <thead><tr><th>Month</th><th>Status</th><th>Last change</th><th /></tr></thead>
              <tbody>
                {MONTHS.map((name, i) => {
                  const m = i + 1;
                  const p = byMonth.get(m);
                  const closed = p?.status === "Closed";
                  const last = closed ? (p?.closed_by ? `Closed by ${p.closed_by}, ${String(p.closed_at).slice(0, 10)}` : "")
                    : p?.reopened_by ? `Reopened by ${p.reopened_by}, ${String(p.reopened_at).slice(0, 10)}` : "";
                  return (
                    <tr key={m}>
                      <td>{name} {year}</td>
                      <td><span className={`badge ${closed ? "badge-closed" : "badge-paid"}`}>{closed ? "Closed" : "Open"}</span></td>
                      <td style={{ color: "var(--text-muted)" }}>{last}</td>
                      <td>
                        <RoleGate need="write">
                          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                            onClick={() => { if (window.confirm(`${closed ? "Reopen" : "Close"} ${name} ${year}?`)) void setStatus([m], closed ? "Open" : "Closed"); }}>
                            {closed ? "Reopen" : "Close"}
                          </button>
                        </RoleGate>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
