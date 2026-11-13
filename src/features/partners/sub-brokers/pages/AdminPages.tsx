import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { pct, useSubBrokerMeta } from "../lib/subBrokers";

interface PendingSplit {
  id: number; sub_broker_id: number; reference_no: string; sub_broker_name: string; class_of_business: string | null;
  rate_bps: number; effective_from: string; created_by: string; reason: string | null; created_at: string;
}

// Maker-checker queue: split changes waiting for a second admin.
export function SplitApprovalsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can, meta } = useSubBrokerMeta();
  const [error, setError] = useState<string | null>(null);
  const pending = useQuery({
    queryKey: ["sub-brokers", "pending-splits"],
    queryFn: () => api.get<{ splits: PendingSplit[] }>("/api/sub-brokers/splits/pending"),
    enabled: can("subbroker.approve-split"),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "reject" }) => api.post(`/api/sub-brokers/splits/${id}/${decision}`),
    onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: ["sub-brokers"] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not record the decision."),
  });
  if (meta && !can("subbroker.approve-split")) return <div className="flash flash-error">You don't have permission to approve split changes.</div>;
  const rows = pending.data?.splits ?? [];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Sub-Brokers</p><h1>Split approvals</h1></div>
        <div className="page-header-actions"><Link className="btn-secondary btn" to="/sub-brokers">Back</Link></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Sub-broker</th><th>Applies to</th><th>New rate</th><th>Effective from</th><th>Proposed by</th><th>Reason</th><th /></tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={7}>Nothing is waiting for approval.</td></tr>}
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/sub-brokers/${s.sub_broker_id}?tab=splits`}>{s.reference_no}</Link> {s.sub_broker_name}</td>
                  <td>{s.class_of_business || "Default rate"}</td>
                  <td><strong>{pct(s.rate_bps)}</strong></td>
                  <td>{s.effective_from}</td>
                  <td>{s.created_by}</td>
                  <td>{s.reason || "—"}</td>
                  <td>
                    {s.created_by === user?.username ? <span className="muted">Needs another admin</span> : (
                      <>
                        <button type="button" className="btn btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: "approve" })}>Approve</button>{" "}
                        <button type="button" className="btn-secondary btn btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: "reject" })}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface Settings { ref_prefix: string; ref_padding: string; ref_year_suffix: string; accrual_basis: string; default_currency: string; ref_counter: string }
interface Rate { id: number; code: string; rate_bps: number; effective_from: string; effective_to: string | null; created_by: string | null }
interface Grant { user_id: number; username: string; permission: string }
interface UserRow { id: number; username: string; role: string }

const RATE_LABELS: Record<string, string> = { VAT: "VAT", NAICOM_LEVY: "NAICOM levy", MISC: "Misc" };

// Admin: reference format, accrual timing, the three statutory deduction
// rates (effective-dated), and who holds which sub-broker permission.
export function SubBrokerSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const settingsQ = useQuery({ queryKey: ["sub-brokers", "settings"], queryFn: () => api.get<{ settings: Settings; deductionRates: Rate[] }>("/api/sub-brokers/settings") });
  const grantsQ = useQuery({ queryKey: ["sub-brokers", "grants"], queryFn: () => api.get<{ grants: Grant[]; permissions: string[] }>("/api/sub-brokers/grants") });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: UserRow[] }>("/api/users") });
  const [draft, setDraft] = useState<Partial<Settings> | null>(null);
  const [rate, setRate] = useState({ code: "VAT", percent: "", effective_from: new Date().toISOString().slice(0, 10) });
  const [grantUser, setGrantUser] = useState("");
  const [grantPerm, setGrantPerm] = useState("");

  const fail = (e: unknown) => { setNotice(null); setError(e instanceof ApiError ? e.message : "Something went wrong."); };
  const done = (msg: string) => { setError(null); setNotice(msg); queryClient.invalidateQueries({ queryKey: ["sub-brokers"] }); };

  const saveSettings = useMutation({
    mutationFn: () => api.put("/api/sub-brokers/settings", {
      ref_prefix: s.ref_prefix, ref_padding: Number(s.ref_padding), ref_year_suffix: s.ref_year_suffix === "1", accrual_basis: s.accrual_basis,
    }),
    onSuccess: () => { setDraft(null); done("Settings saved. They apply to new sub-brokers and future commission only."); },
    onError: fail,
  });
  const addRate = useMutation({
    mutationFn: () => api.post("/api/sub-brokers/deduction-rates", rate),
    onSuccess: () => { setRate((r) => ({ ...r, percent: "" })); done("Rate added. Commission already posted keeps the rate it used."); },
    onError: fail,
  });
  const setGrant = useMutation({
    mutationFn: (v: { user_id: number; permission: string; grant: boolean }) => api.put("/api/sub-brokers/grants", v),
    onSuccess: () => done("Permissions updated."),
    onError: fail,
  });

  if (settingsQ.isError) return <div className="flash flash-error">Admin access required.</div>;
  if (!settingsQ.data) return <p className="exec-state">Loading…</p>;
  const s = { ...settingsQ.data.settings, ...draft } as Settings;
  const preview = `${s.ref_prefix}-${String(Number(settingsQ.data.settings.ref_counter) + 1).padStart(Number(s.ref_padding) || 1, "0")}${s.ref_year_suffix === "1" ? `-${String(new Date().getFullYear()).slice(2)}` : ""}`;
  const staff = (usersQ.data?.users ?? []).filter((u) => u.role !== "agent");

  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Sub-Brokers</p><h1>Settings</h1></div>
        <div className="page-header-actions"><Link className="btn-secondary btn" to="/sub-brokers">Back</Link></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {notice && <div className="flash flash-success">{notice}</div>}

      <div className="card">
        <h2>Reference numbers and commission timing</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="pf">Prefix</label><input id="pf" value={s.ref_prefix} onChange={(e) => setDraft((d) => ({ ...d, ref_prefix: e.target.value.toUpperCase() }))} /></div>
          <div className="field"><label htmlFor="pad">Digits</label><input id="pad" type="number" min={1} max={10} value={s.ref_padding} onChange={(e) => setDraft((d) => ({ ...d, ref_padding: e.target.value }))} /></div>
          <div className="field"><label htmlFor="ys">Year suffix</label>
            <select id="ys" value={s.ref_year_suffix} onChange={(e) => setDraft((d) => ({ ...d, ref_year_suffix: e.target.value }))}><option value="1">Add 2-digit year</option><option value="0">None</option></select></div>
          <div className="field span-2"><label htmlFor="ab">Commission accrues</label>
            <select id="ab" value={s.accrual_basis} onChange={(e) => setDraft((d) => ({ ...d, accrual_basis: e.target.value }))}>
              <option value="placement">At placement (payable once the premium is paid in full)</option>
              <option value="payment">As premium is received</option>
            </select></div>
        </div>
        <p className="muted">Next reference: <strong>{preview}</strong>. Numbers already issued never change and are never reused. Direct Bill business accrues only after the insurer's commission statement is reconciled, whichever timing is chosen.</p>
        <div className="form-actions"><button type="button" className="btn" disabled={!draft || saveSettings.isPending} onClick={() => saveSettings.mutate()}>Save settings</button></div>
      </div>

      <div className="card">
        <h2>Statutory deductions (on the sub-broker's gross share)</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Deduction</th><th className="num">Rate</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              {settingsQ.data.deductionRates.map((r) => (
                <tr key={r.id}><td>{RATE_LABELS[r.code] ?? r.code}</td><td className="num">{pct(r.rate_bps)}</td><td>{r.effective_from}</td><td>{r.effective_to || "current"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Set a new rate</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="rc">Deduction</label>
            <select id="rc" value={rate.code} onChange={(e) => setRate((r) => ({ ...r, code: e.target.value }))}>{Object.entries(RATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="rp">New rate (%)</label><input id="rp" inputMode="decimal" value={rate.percent} onChange={(e) => setRate((r) => ({ ...r, percent: e.target.value }))} /></div>
          <div className="field"><label htmlFor="rf">Effective from</label><input id="rf" type="date" value={rate.effective_from} onChange={(e) => setRate((r) => ({ ...r, effective_from: e.target.value }))} /></div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" disabled={addRate.isPending}
            onClick={() => (/^\d+(\.\d{1,2})?$/.test(rate.percent.trim()) && Number(rate.percent) <= 100 ? addRate.mutate() : fail(new ApiError("Enter a rate from 0 to 100 with up to 2 decimals.", 400)))}>Add rate</button>
        </div>
      </div>

      <div className="card">
        <h2>Who can do what</h2>
        <p className="muted">Admins hold every permission. Editors can view, create, edit and report. Grant anything further here; viewers need a grant for even basic access. Agents can't hold these.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>User</th><th>Granted</th><th /></tr></thead>
            <tbody>
              {!grantsQ.data?.grants.length && <tr><td colSpan={3}>No extra grants.</td></tr>}
              {grantsQ.data?.grants.map((g) => (
                <tr key={`${g.user_id}-${g.permission}`}>
                  <td>{g.username}</td><td><StatusBadge status={g.permission.replace("subbroker.", "")} /></td>
                  <td><button type="button" className="btn-secondary btn btn-sm" onClick={() => setGrant.mutate({ user_id: g.user_id, permission: g.permission, grant: false })}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <select aria-label="User" value={grantUser} onChange={(e) => setGrantUser(e.target.value)}>
            <option value="">User…</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
          </select>
          <select aria-label="Permission" value={grantPerm} onChange={(e) => setGrantPerm(e.target.value)}>
            <option value="">Permission…</option>{(grantsQ.data?.permissions ?? []).map((p) => <option key={p}>{p}</option>)}
          </select>
          <button type="button" className="btn" disabled={!grantUser || !grantPerm || setGrant.isPending} onClick={() => setGrant.mutate({ user_id: Number(grantUser), permission: grantPerm, grant: true })}>Grant</button>
        </div>
      </div>
    </div>
  );
}
