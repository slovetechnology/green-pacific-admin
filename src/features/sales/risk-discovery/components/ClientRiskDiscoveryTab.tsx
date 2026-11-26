import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import "@/shared/styles/pipeline.css";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { confirmDialog } from "@/shared/components/Dialogs";
import { fmtMoney } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";
import type { FormOptions } from "@/features/sales/pipeline/lib/types";
import { expiringUrl, lossHistoryUrl, type ExpiringPolicy, type LossHistory, type LossRow } from "../api";

// A client's risk discovery (backend risk-discovery/lossHistory.js and expiringPolicies.js): the losses they have had
// (from their declaration or an insurer's loss run) and the policies they hold with other brokers or insurers.
// Loss history for a deal's class goes on its broking slip; an expiring policy can open a new-business deal.

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`); // the API gives a percentage

function useFormOptions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["deals", "form-options"],
    queryFn: () => api.get<FormOptions>("/api/deals/meta/form-options"),
    enabled: Boolean(user && !user.isAgent),
    staleTime: 60_000,
  }).data;
}

function ClassField({ id, value, onChange, classes }: { id: string; value: string; onChange: (v: string) => void; classes: string[] | undefined }) {
  return (
    <div className="field">
      <label htmlFor={id}>Class of business</label>
      {classes?.length ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="">Choose…</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} required />
      )}
    </div>
  );
}

export function ClientRiskDiscoveryTab({ clientId }: { clientId: number }) {
  const { user } = useAuth();
  const canWrite = Boolean(user?.canWrite);
  const options = useFormOptions();
  return (
    <div role="tabpanel" id="client-panel-discovery" aria-labelledby="client-tab-discovery" tabIndex={0} className="exec-tabpanel">
      <ExpiringPoliciesPanel clientId={clientId} canWrite={canWrite} options={options} />
      <LossHistoryPanel clientId={clientId} canWrite={canWrite} classes={options?.classes} />
    </div>
  );
}

// ---------------------------------------------------------------- loss history

const EMPTY_LOSS = { class_of_business: "", period_start: "", period_end: "", insurer_name: "", premium: "", claims_count: "0", paid: "", outstanding: "", largest_loss: "", description: "", source: "Client declaration" };

function LossHistoryPanel({ clientId, canWrite, classes }: { clientId: number; canWrite: boolean; classes: string[] | undefined }) {
  const queryClient = useQueryClient();
  const key = ["risk-discovery", "loss-history", clientId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<LossHistory>(lossHistoryUrl(clientId)) });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_LOSS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_LOSS) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit(row: LossRow | null) {
    setMessage(null);
    if (!row) { setForm(EMPTY_LOSS); setEditing("new"); return; }
    setForm({
      class_of_business: row.class_of_business, period_start: row.period_start, period_end: row.period_end, insurer_name: row.insurer_name ?? "",
      premium: String(row.premium || ""), claims_count: String(row.claims_count), paid: String(row.paid || ""), outstanding: String(row.outstanding || ""),
      largest_loss: String(row.largest_loss || ""), description: row.description ?? "", source: row.source,
    });
    setEditing(row.id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = { ...form, claims_count: Number(form.claims_count || 0) };
      if (editing === "new") await api.post(lossHistoryUrl(clientId), body);
      else await api.put(`/api/risk-discovery/loss-history/${editing}`, body);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setMessage(errorText(err, "The loss record could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: LossRow) {
    if (!(await confirmDialog(`Delete the ${row.class_of_business} losses for ${row.period_start} to ${row.period_end}?`))) return;
    try {
      await api.delete(`/api/risk-discovery/loss-history/${row.id}`);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setMessage(errorText(err, "The loss record could not be deleted."));
    }
  }

  return (
    <Panel
      eyebrow="Risk discovery"
      title="Loss history"
      actions={canWrite && editing === null ? <button type="button" className="btn btn-sm" onClick={() => startEdit(null)}>Add a period</button> : undefined}
    >
      <p className="pl-hint">Claims the client has had, with us or elsewhere, by class and period. The last five years for a deal's class go on its broking slip.</p>
      {isLoading && <p className="exec-state">Loading…</p>}
      {error && <p className="exec-state">The loss history could not be loaded.</p>}
      {data && data.summary.length > 0 && (
        <div className="exec-table-wrap" style={{ marginBottom: "0.8rem" }}>
          <table className="exec-table is-static">
            <caption className="exec-sub" style={{ textAlign: "left" }}>By class</caption>
            <thead><tr><th>Class</th><th>Periods</th><th>Claims</th><th className="num">Premium</th><th className="num">Incurred</th><th className="num">Loss ratio</th></tr></thead>
            <tbody>
              {data.summary.map((s) => (
                <tr key={s.class_of_business}><td>{s.class_of_business}</td><td>{s.periods}</td><td>{s.claims}</td><td className="num">{fmtMoney(s.premium)}</td><td className="num">{fmtMoney(s.incurred)}</td><td className="num">{pct(s.loss_ratio)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.rows.length === 0 && editing === null && <p className="pl-hint" style={{ margin: 0 }}>No losses recorded yet.</p>}
      {data && data.rows.length > 0 && (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Class</th><th>Period</th><th>Insurer</th><th>Claims</th><th className="num">Paid</th><th className="num">Outstanding</th><th className="num">Largest</th><th className="num">Loss ratio</th><th>Source</th>{canWrite && <th></th>}</tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.class_of_business}{r.description && <div className="pl-hint">{r.description}</div>}</td>
                  <td>{r.period_start} to {r.period_end}</td>
                  <td>{r.insurer_name ?? "—"}</td>
                  <td>{r.claims_count}</td>
                  <td className="num">{fmtMoney(r.paid)}</td>
                  <td className="num">{fmtMoney(r.outstanding)}</td>
                  <td className="num">{r.largest_loss ? fmtMoney(r.largest_loss) : "—"}</td>
                  <td className="num">{pct(r.loss_ratio)}</td>
                  <td>{r.source}</td>
                  {canWrite && (
                    <td className="pl-actions">
                      <button type="button" className="btn-link" onClick={() => startEdit(r)} disabled={editing !== null}>Edit</button>
                      <button type="button" className="btn-link" onClick={() => remove(r)} disabled={editing !== null}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && (
        <form onSubmit={submit} style={{ marginTop: "0.8rem" }}>
          <h3 className="exec-sub">{editing === "new" ? "Add a period" : "Edit the period"}</h3>
          <div className="pl-inline-form">
            <ClassField id="lh-class" value={form.class_of_business} onChange={set("class_of_business")} classes={classes} />
            <div className="field"><label htmlFor="lh-start">Period starts</label><input id="lh-start" type="date" required value={form.period_start} onChange={(e) => set("period_start")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-end">Period ends</label><input id="lh-end" type="date" required value={form.period_end} onChange={(e) => set("period_end")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-insurer">Insurer</label><input id="lh-insurer" value={form.insurer_name} onChange={(e) => set("insurer_name")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-premium">Premium (₦)</label><input id="lh-premium" type="number" min="0" step="0.01" value={form.premium} onChange={(e) => set("premium")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-claims">Number of claims</label><input id="lh-claims" type="number" min="0" step="1" required value={form.claims_count} onChange={(e) => set("claims_count")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-paid">Paid (₦)</label><input id="lh-paid" type="number" min="0" step="0.01" value={form.paid} onChange={(e) => set("paid")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-os">Outstanding (₦)</label><input id="lh-os" type="number" min="0" step="0.01" value={form.outstanding} onChange={(e) => set("outstanding")(e.target.value)} /></div>
            <div className="field"><label htmlFor="lh-largest">Largest single loss (₦)</label><input id="lh-largest" type="number" min="0" step="0.01" value={form.largest_loss} onChange={(e) => set("largest_loss")(e.target.value)} /></div>
            <div className="field">
              <label htmlFor="lh-source">Source</label>
              <select id="lh-source" value={form.source} onChange={(e) => set("source")(e.target.value)}>
                {(data?.sources ?? ["Client declaration"]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field is-wide"><label htmlFor="lh-desc">What happened</label><textarea id="lh-desc" rows={2} value={form.description} onChange={(e) => set("description")(e.target.value)} placeholder="The main losses: cause, date and amount" /></div>
          </div>
          {message && <div className="flash flash-error" role="alert">{message}</div>}
          <div className="pl-actions" style={{ marginTop: "0.6rem" }}>
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setEditing(null); setMessage(null); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {message && editing === null && <div className="flash flash-error" role="alert">{message}</div>}
    </Panel>
  );
}

// ---------------------------------------------------------------- policies held elsewhere

const EMPTY_EXP = { class_of_business: "", insurer_id: "", insurer_name: "", current_broker: "", policy_no: "", sum_insured: "", premium: "", start_date: "", expiry_date: "", notes: "", status: "Open" };

export function ExpiringPoliciesPanel({ clientId, canWrite, options }: { clientId: number; canWrite: boolean; options: FormOptions | undefined }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const key = ["risk-discovery", "expiring", clientId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<{ rows: ExpiringPolicy[]; statuses: string[] }>(expiringUrl(clientId)) });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_EXP);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_EXP) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit(row: ExpiringPolicy | null) {
    setMessage(null);
    if (!row) { setForm(EMPTY_EXP); setEditing("new"); return; }
    setForm({
      class_of_business: row.class_of_business, insurer_id: row.insurer_id ? String(row.insurer_id) : "", insurer_name: row.insurer_id ? "" : row.insurer_name ?? "",
      current_broker: row.current_broker ?? "", policy_no: row.policy_no ?? "", sum_insured: row.sum_insured === null ? "" : String(row.sum_insured),
      premium: row.premium === null ? "" : String(row.premium), start_date: row.start_date ?? "", expiry_date: row.expiry_date, notes: row.notes ?? "", status: row.status,
    });
    setEditing(row.id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      const body = { ...form, insurer_id: form.insurer_id ? Number(form.insurer_id) : null, insurer_name: form.insurer_id ? null : form.insurer_name };
      if (editing === "new") await api.post(expiringUrl(clientId), body);
      else await api.put(`/api/risk-discovery/expiring-policies/${editing}`, body);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setMessage(errorText(err, "The policy could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: ExpiringPolicy) {
    if (!(await confirmDialog(`Delete the ${row.class_of_business} policy with ${row.insurer_name ?? "the other insurer"}?`))) return;
    try {
      await api.delete(`/api/risk-discovery/expiring-policies/${row.id}`);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setMessage(errorText(err, "The policy could not be deleted."));
    }
  }

  async function openDeal(row: ExpiringPolicy) {
    if (!(await confirmDialog({ title: "Open a deal?", message: `This opens a new-business deal for the ${row.class_of_business} cover expiring ${row.expiry_date}, with its premium and sum insured as estimates.`, confirmLabel: "Open deal" }))) return;
    setBusy(`deal-${row.id}`);
    setMessage(null);
    try {
      const out = await api.post<{ deal: { id: number } }>(`/api/risk-discovery/expiring-policies/${row.id}/open-deal`, {});
      await queryClient.invalidateQueries({ queryKey: key });
      navigate(`/deals/${out.deal.id}?tab=risk`);
    } catch (err) {
      setMessage(errorText(err, "The deal could not be opened."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      eyebrow="Risk discovery"
      title="Policies held elsewhere"
      actions={canWrite && editing === null ? <button type="button" className="btn btn-sm" onClick={() => startEdit(null)}>Add a policy</button> : undefined}
    >
      <p className="pl-hint">Cover the client has with other insurers or brokers. Each one is a chance to quote at its expiry: open a deal from it.</p>
      {isLoading && <p className="exec-state">Loading…</p>}
      {error && <p className="exec-state">The policies could not be loaded.</p>}
      {data && data.rows.length === 0 && editing === null && <p className="pl-hint" style={{ margin: 0 }}>None recorded.</p>}
      {data && data.rows.length > 0 && <ExpiringTable rows={data.rows} canWrite={canWrite} busy={busy} locked={editing !== null} onEdit={startEdit} onDelete={remove} onOpenDeal={openDeal} />}
      {editing !== null && (
        <form onSubmit={submit} style={{ marginTop: "0.8rem" }}>
          <h3 className="exec-sub">{editing === "new" ? "Add a policy" : "Edit the policy"}</h3>
          <div className="pl-inline-form">
            <ClassField id="ep-class" value={form.class_of_business} onChange={set("class_of_business")} classes={options?.classes} />
            <div className="field">
              <label htmlFor="ep-insurer">Insurer</label>
              <select id="ep-insurer" value={form.insurer_id} onChange={(e) => set("insurer_id")(e.target.value)}>
                <option value="">Not on our panel (type below)</option>
                {options?.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            {!form.insurer_id && <div className="field"><label htmlFor="ep-insurer-name">Insurer name</label><input id="ep-insurer-name" required value={form.insurer_name} onChange={(e) => set("insurer_name")(e.target.value)} /></div>}
            <div className="field"><label htmlFor="ep-broker">Current broker</label><input id="ep-broker" value={form.current_broker} onChange={(e) => set("current_broker")(e.target.value)} placeholder="Blank if placed direct" /></div>
            <div className="field"><label htmlFor="ep-no">Policy number</label><input id="ep-no" value={form.policy_no} onChange={(e) => set("policy_no")(e.target.value)} /></div>
            <div className="field"><label htmlFor="ep-sum">Sum insured (₦)</label><input id="ep-sum" type="number" min="0" step="0.01" value={form.sum_insured} onChange={(e) => set("sum_insured")(e.target.value)} /></div>
            <div className="field"><label htmlFor="ep-prem">Premium (₦)</label><input id="ep-prem" type="number" min="0" step="0.01" value={form.premium} onChange={(e) => set("premium")(e.target.value)} /></div>
            <div className="field"><label htmlFor="ep-start">Started</label><input id="ep-start" type="date" value={form.start_date} onChange={(e) => set("start_date")(e.target.value)} /></div>
            <div className="field"><label htmlFor="ep-expiry">Expires</label><input id="ep-expiry" type="date" required value={form.expiry_date} onChange={(e) => set("expiry_date")(e.target.value)} /></div>
            {editing !== "new" && (
              <div className="field">
                <label htmlFor="ep-status">Status</label>
                <select id="ep-status" value={form.status} onChange={(e) => set("status")(e.target.value)}>
                  {(data?.statuses ?? ["Open", "Deal Opened", "Closed"]).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div className="field is-wide"><label htmlFor="ep-notes">Notes</label><textarea id="ep-notes" rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
          </div>
          {message && <div className="flash flash-error" role="alert">{message}</div>}
          <div className="pl-actions" style={{ marginTop: "0.6rem" }}>
            <button type="submit" className="btn btn-sm" disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setEditing(null); setMessage(null); }} disabled={busy !== null}>Cancel</button>
          </div>
        </form>
      )}
      {message && editing === null && <div className="flash flash-error" role="alert">{message}</div>}
    </Panel>
  );
}

function expiryLabel(days: number | null) {
  if (days === null) return "—";
  if (days < 0) return `Expired ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

export function ExpiringTable({ rows, canWrite, busy, locked = false, showClient = false, onEdit, onDelete, onOpenDeal }: {
  rows: ExpiringPolicy[]; canWrite: boolean; busy: string | null; locked?: boolean; showClient?: boolean;
  onEdit?: (row: ExpiringPolicy) => void; onDelete?: (row: ExpiringPolicy) => void; onOpenDeal: (row: ExpiringPolicy) => void;
}) {
  return (
    <div className="exec-table-wrap">
      <table className="exec-table is-static">
        <thead>
          <tr>
            {showClient && <th>Client</th>}<th>Class</th><th>Insurer</th><th>Broker</th><th className="num">Premium</th><th>Expires</th><th>Status</th>{canWrite && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {showClient && <td><Link to={`/clients/${r.client_id}?tab=discovery`}>{r.client_name ?? `Client ${r.client_id}`}</Link></td>}
              <td>{r.class_of_business}{r.policy_no && <div className="pl-hint">{r.policy_no}</div>}</td>
              <td>{r.insurer_name ?? "—"}</td>
              <td>{r.current_broker ?? "Direct"}</td>
              <td className="num">{r.premium === null ? "—" : fmtMoney(r.premium)}</td>
              <td>{r.expiry_date}<div className="pl-hint">{expiryLabel(r.days_to_expiry)}</div></td>
              <td>
                <StatusBadge status={r.status} />
                {r.deal && <div className="pl-hint"><Link to={`/deals/${r.deal.id}`}>{r.deal.stage} deal</Link></div>}
              </td>
              {canWrite && (
                <td className="pl-actions">
                  {r.status === "Open" && !r.renewal_deal_id && (
                    <button type="button" className="btn btn-sm" onClick={() => onOpenDeal(r)} disabled={busy !== null || locked}>{busy === `deal-${r.id}` ? "Opening…" : "Open deal"}</button>
                  )}
                  {onEdit && <button type="button" className="btn-link" onClick={() => onEdit(r)} disabled={busy !== null || locked}>Edit</button>}
                  {onDelete && !r.renewal_deal_id && <button type="button" className="btn-link" onClick={() => onDelete(r)} disabled={busy !== null || locked}>Delete</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
