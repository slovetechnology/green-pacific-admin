import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";

// Admin > Approval limits (backend platform/approval-limits). The authority matrix: how much each role or person may
// approve, per action. An action with no limits keeps today's rules. Once an action has a limit, someone no limit
// names may not approve it (admins excepted, unless an Admin limit caps them).

interface Limit { id: number; action: string; holder: string; holder_label: string; max_amount: number | null; active: number; notes: string | null; created_by: string; created_at: string; updated_by: string | null }
interface Action { action: string; label: string; amount: string }
interface Data { limits: Limit[]; actions: Action[]; holders: { holder: string; label: string }[] }

export function ApprovalLimitsPage() {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState(false);
  const query = useQuery({ queryKey: ["approval-limits", history], queryFn: () => api.get<Data>(`/api/approval-limits${history ? "?history=1" : ""}`) });
  const [form, setForm] = useState({ action: "", holder: "", max_amount: "", notes: "" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["approval-limits"] });
  const save = useMutation({ mutationFn: () => api.post("/api/approval-limits", form), onSuccess: () => { setForm({ action: form.action, holder: "", max_amount: "", notes: "" }); void refresh(); } });
  const retire = useMutation({ mutationFn: (id: number) => api.delete(`/api/approval-limits/${id}`), onSuccess: () => void refresh() });

  const data = query.data;
  const actions = data?.actions ?? [];
  const byAction = (a: string) => (data?.limits ?? []).filter((l) => l.action === a);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Approval limits</h1>
          <p className="text-muted">
            How much each role or person may approve. An action with no limits keeps today's rules. Once you add a limit to an
            action, only the people a limit names can approve it, up to their highest limit; admins stay unlimited unless an
            Admin limit is set. Leave the amount blank for no limit.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Show replaced limits
        </label>
      </div>

      <div className="card">
        <h2>Add or change a limit</h2>
        {save.isError && <div className="flash flash-error">{(save.error as Error).message}</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="al_action">Action</label>
            <select id="al_action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              <option value="">Choose…</option>
              {actions.map((a) => <option key={a.action} value={a.action}>{a.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="al_holder">Who</label>
            <select id="al_holder" value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })}>
              <option value="">Choose…</option>
              {(data?.holders ?? []).map((h) => <option key={h.holder} value={h.holder}>{h.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="al_amount">Up to (NGN)</label>
            <input id="al_amount" inputMode="decimal" placeholder="Blank = no limit" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="al_notes">Note (optional)</label>
            <input id="al_notes" placeholder="e.g. Board resolution 2026/14" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        {form.action && <p className="text-muted">The amount checked is {actions.find((a) => a.action === form.action)?.amount}. Saving replaces this person's or role's current limit for the action.</p>}
        <button type="button" className="btn" disabled={!form.action || !form.holder || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save limit"}</button>
      </div>

      {retire.isError && <div className="flash flash-error">{(retire.error as Error).message}</div>}
      {actions.map((a) => {
        const rows = byAction(a.action);
        return (
          <div className="card" key={a.action}>
            <h2 style={{ marginBottom: "0.25rem" }}>{a.label}</h2>
            <p className="text-muted" style={{ marginTop: 0 }}>{rows.some((r) => r.active) ? `Checked against ${a.amount}.` : "No limits: today's rules apply."}</p>
            {rows.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Who</th><th className="num">Up to</th><th>Note</th><th>Set by</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} style={r.active ? undefined : { opacity: 0.6 }}>
                        <td>{r.holder_label}{!r.active && <span className="text-muted"> (replaced)</span>}</td>
                        <td className="num">{r.max_amount === null ? "No limit" : fmtMoney(r.max_amount)}</td>
                        <td>{r.notes || "—"}</td>
                        <td>{r.created_by}<div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.created_at}</div></td>
                        <td>{r.active ? <button type="button" className="btn btn-sm btn-secondary" onClick={() => retire.mutate(r.id)}>Remove</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
