import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";

// A claim's service clock (backend claimSla.js: each stage's target, worked out from the claim's history) and its
// reserve history (claim_reserve_movements; a reserve changed on the claim form is recorded as an adjustment).

export interface ServiceStage { key: string; label: string; state: string; start: string | null; due: string | null; end: string | null; daysLate?: number }
export interface ReserveMovement { id: number; movement_date: string; amount: number; movement_type: string; reason: string | null; created_by: string | null }

const STATE: Record<string, { text: string; badge: string }> = {
  not_started: { text: "Not started", badge: "badge" },
  open: { text: "On time", badge: "badge badge-secondary" },
  due_today: { text: "Due today", badge: "badge badge-warning" },
  overdue: { text: "Overdue", badge: "badge badge-cancelled" },
  met: { text: "Met", badge: "badge badge-paid" },
  late: { text: "Met late", badge: "badge badge-warning" },
  not_needed: { text: "Not needed", badge: "badge" },
};
const MOVES = ["Adjustment", "Initial Reserve", "Payment", "Recovery", "Release"];

export function ClaimServicePanel({ claimId, stages, reserve, movements }: { claimId: string; stages: ServiceStage[]; reserve: number; movements: ReserveMovement[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ movement_type: "Adjustment", amount: "", reason: "", movement_date: new Date().toISOString().slice(0, 10) });
  const add = useMutation({
    mutationFn: () => api.post(`/api/compliance/claims/${claimId}/reserves`, form),
    onSuccess: () => { setForm({ ...form, amount: "", reason: "" }); void queryClient.invalidateQueries({ queryKey: ["claims", claimId] }); },
  });

  return (
    <>
      <div className="card">
        <h2>Service clock</h2>
        <p className="text-muted" style={{ marginTop: 0 }}>Each stage's target, from the claim's status history. Overdue stages raise a task for the handler.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Stage</th><th>Started</th><th>Due</th><th>Done</th><th>State</th></tr></thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td>{s.start || "—"}</td>
                  <td>{s.due || "—"}</td>
                  <td>{s.end || "—"}</td>
                  <td><span className={STATE[s.state]?.badge || "badge"}>{STATE[s.state]?.text || s.state}</span>{s.daysLate ? <span className="text-muted"> {s.daysLate} day{s.daysLate === 1 ? "" : "s"}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Reserve history</h2>
        <p className="text-muted" style={{ marginTop: 0 }}>Current reserve <strong>{fmtMoney(reserve)}</strong>. Every change is kept here.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Movement</th><th className="num">Amount</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan={5}>No reserve movements yet.</td></tr>}
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.movement_date}</td>
                  <td>{m.movement_type}</td>
                  <td className="num">{fmtMoney(m.amount)}</td>
                  <td>{m.reason || "—"}</td>
                  <td>{m.created_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {user?.canWrite && (
          <>
            {add.isError && <div className="flash flash-error">{(add.error as Error).message}</div>}
            <div className="form-grid" style={{ marginTop: "0.75rem" }}>
              <div className="field">
                <label htmlFor="rm_type">Movement</label>
                <select id="rm_type" value={form.movement_type} onChange={(e) => setForm({ ...form, movement_type: e.target.value })}>
                  {MOVES.map((m) => <option key={m} value={m}>{m}{m === "Release" || m === "Recovery" ? " (reduces)" : " (adds)"}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="rm_amount">Amount (NGN)</label><input id="rm_amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="field"><label htmlFor="rm_date">Date</label><input id="rm_date" type="date" value={form.movement_date} onChange={(e) => setForm({ ...form, movement_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="rm_reason">Reason</label><input id="rm_reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Adjuster's interim report" /></div>
            </div>
            <button type="button" className="btn btn-sm" disabled={!form.amount || add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Saving…" : "Record movement"}</button>
          </>
        )}
      </div>
    </>
  );
}
