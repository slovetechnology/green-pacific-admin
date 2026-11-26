import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, openApiFile } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";

// Underwriting > Claims service (backend claimSla.js, claimService.js): open claims by age, the claims bordereau per
// insurer, the target time for each claim stage (admins change them) and the adjuster and surveyor register.

interface Bucket { count: number; reserve: number }
interface Aged {
  buckets: { key: string; label: string }[];
  insurers: ({ insurer_name: string; total: Bucket } & Record<string, Bucket | string>)[];
  totals: Record<string, Bucket>;
  claims: { id: number; claim_no: string; client_name: string; insurer_name: string | null; status: string; date_reported: string; age_days: number; reserve_amount: number }[];
}
interface Target { key: string; label: string; days: number; workingDays: boolean; active: boolean; updated_by: string | null }
interface Adjuster { id: number; name: string; firm: string | null; kind: string; phone: string | null; email: string | null; licence_no: string | null; notes: string | null; active: number; open_claims: number }
interface Bordereau {
  insurer: { id: number; name: string }; from: string; to: string;
  claims: { id: number; claim_no: string; insurer_claim_no: string | null; client_name: string; policy_no: string | null; date_of_loss: string | null; date_reported: string; status: string; claimed_amount: number; reserve_amount: number; approved_amount: number; received_from_insurer: number; paid_to_client: number }[];
  totals: { claimed_amount: number; reserve_amount: number; approved_amount: number; received_from_insurer: number; paid_to_client: number };
}

const TABS = [["aged", "Aged claims"], ["bordereau", "Bordereau"], ["targets", "Service targets"], ["adjusters", "Adjusters & surveyors"]] as const;
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const today = () => new Date().toISOString().slice(0, 10);
const blankAdjuster = { name: "", firm: "", kind: "Loss adjuster", phone: "", email: "", licence_no: "", notes: "", active: true };

export function ClaimsServicePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("aged");

  const aged = useQuery({ queryKey: ["claims", "aged"], enabled: tab === "aged", queryFn: () => api.get<Aged>("/api/claims/reports/aged") });
  const targets = useQuery({ queryKey: ["claims", "targets"], enabled: tab === "targets", queryFn: () => api.get<{ targets: Target[] }>("/api/claims/meta/service-targets") });
  const adjusters = useQuery({ queryKey: ["loss-adjusters", "all"], enabled: tab === "adjusters", queryFn: () => api.get<{ adjusters: Adjuster[]; kinds: string[] }>("/api/loss-adjusters?all=1") });
  const insurers = useQuery({ queryKey: ["insurers", "names"], enabled: tab === "bordereau", queryFn: () => api.get<{ insurers: { id: number; name: string }[] }>("/api/settlements").then((r) => ({ insurers: (r as unknown as { insurers: { id: number; name: string }[] }).insurers })) });

  const [bq, setBq] = useState({ insurer_id: "", from: monthStart(), to: today() });
  const bParams = new URLSearchParams(bq).toString();
  const bordereau = useQuery({ queryKey: ["claims", "bordereau", bParams], enabled: tab === "bordereau" && Boolean(bq.insurer_id), queryFn: () => api.get<Bordereau>(`/api/claims/reports/bordereau?${bParams}`) });

  const [editTarget, setEditTarget] = useState<Target | null>(null);
  const saveTarget = useMutation({
    mutationFn: (t: Target) => api.put(`/api/claims/meta/service-targets/${t.key}`, { target_days: t.days, working_days: t.workingDays, active: t.active }),
    onSuccess: () => { setEditTarget(null); void queryClient.invalidateQueries({ queryKey: ["claims"] }); },
  });
  const [adj, setAdj] = useState<{ id: number | null } & typeof blankAdjuster>({ id: null, ...blankAdjuster });
  const saveAdj = useMutation({
    mutationFn: () => (adj.id ? api.put(`/api/loss-adjusters/${adj.id}`, adj) : api.post("/api/loss-adjusters", adj)),
    onSuccess: () => { setAdj({ id: null, ...blankAdjuster }); void queryClient.invalidateQueries({ queryKey: ["loss-adjusters"] }); },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Underwriting</p>
          <h1>Claims service</h1>
          <p className="text-muted">How long open claims have been running, the claims bordereau for each insurer, the target time for each claim stage, and the adjusters and surveyors we use.</p>
        </div>
      </div>
      <div className="actions-row" role="tablist" style={{ marginBottom: "1rem" }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "btn btn-sm" : "btn btn-sm btn-secondary"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "aged" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Open claims by age</h2>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => void openApiFile("/api/claims/reports/aged?format=xlsx")}>Download Excel</button>
          </div>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data-table">
              <thead><tr><th>Insurer</th>{aged.data?.buckets.map((b) => <th key={b.key} className="num">{b.label}</th>)}<th className="num">Total</th><th className="num">Reserve</th></tr></thead>
              <tbody>
                {aged.isLoading && <tr><td colSpan={8}>Loading…</td></tr>}
                {aged.data && aged.data.insurers.length === 0 && <tr><td colSpan={8}>No open claims.</td></tr>}
                {aged.data?.insurers.map((g) => (
                  <tr key={g.insurer_name}>
                    <td>{g.insurer_name}</td>
                    {aged.data!.buckets.map((b) => <td key={b.key} className="num">{(g[b.key] as Bucket).count || "—"}</td>)}
                    <td className="num"><strong>{g.total.count}</strong></td>
                    <td className="num">{fmtMoney(g.total.reserve)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aged.data && aged.data.claims.length > 0 && (
            <>
              <h3 style={{ marginTop: "1.25rem" }}>Oldest first</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Claim</th><th>Client</th><th>Insurer</th><th>Status</th><th>Reported</th><th className="num">Age (days)</th><th className="num">Reserve</th></tr></thead>
                  <tbody>
                    {aged.data.claims.slice(0, 50).map((c) => (
                      <tr key={c.id}>
                        <td><Link to={`/claims/${c.id}?tab=service`}>{c.claim_no}</Link></td>
                        <td>{c.client_name}</td><td>{c.insurer_name || "—"}</td><td>{c.status}</td><td>{c.date_reported}</td>
                        <td className="num">{c.age_days}</td><td className="num">{fmtMoney(c.reserve_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "bordereau" && (
        <div className="card">
          <h2>Claims bordereau</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="bd_insurer">Insurer</label>
              <select id="bd_insurer" value={bq.insurer_id} onChange={(e) => setBq({ ...bq, insurer_id: e.target.value })}>
                <option value="">Choose…</option>
                {(insurers.data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="bd_from">Reported from</label><input id="bd_from" type="date" value={bq.from} onChange={(e) => setBq({ ...bq, from: e.target.value })} /></div>
            <div className="field"><label htmlFor="bd_to">To</label><input id="bd_to" type="date" value={bq.to} onChange={(e) => setBq({ ...bq, to: e.target.value })} /></div>
          </div>
          {bordereau.isError && <div className="flash flash-error">{(bordereau.error as Error).message}</div>}
          {bordereau.data && (
            <>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => void openApiFile(`/api/claims/reports/bordereau?${bParams}&format=xlsx`)}>Download Excel</button>
              <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                <table className="data-table">
                  <thead><tr><th>Claim</th><th>Insurer's ref</th><th>Client</th><th>Policy</th><th>Loss</th><th>Status</th><th className="num">Claimed</th><th className="num">Reserve</th><th className="num">Received</th><th className="num">Paid</th></tr></thead>
                  <tbody>
                    {bordereau.data.claims.length === 0 && <tr><td colSpan={10}>No claims reported for this insurer in the period.</td></tr>}
                    {bordereau.data.claims.map((c) => (
                      <tr key={c.id}>
                        <td><Link to={`/claims/${c.id}`}>{c.claim_no}</Link></td><td>{c.insurer_claim_no || "—"}</td><td>{c.client_name}</td><td>{c.policy_no || "—"}</td>
                        <td>{c.date_of_loss || "—"}</td><td>{c.status}</td>
                        <td className="num">{fmtMoney(c.claimed_amount)}</td><td className="num">{fmtMoney(c.reserve_amount)}</td>
                        <td className="num">{fmtMoney(c.received_from_insurer)}</td><td className="num">{fmtMoney(c.paid_to_client)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={6}>Total</th><th className="num">{fmtMoney(bordereau.data.totals.claimed_amount)}</th><th className="num">{fmtMoney(bordereau.data.totals.reserve_amount)}</th><th className="num">{fmtMoney(bordereau.data.totals.received_from_insurer)}</th><th className="num">{fmtMoney(bordereau.data.totals.paid_to_client)}</th></tr></tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "targets" && (
        <div className="card">
          <h2>Service targets</h2>
          <p className="text-muted" style={{ marginTop: 0 }}>When a stage passes its target, the claim's handler gets a task (once per claim and stage).{user?.isAdmin ? "" : " Only an admin can change these."}</p>
          {saveTarget.isError && <div className="flash flash-error">{(saveTarget.error as Error).message}</div>}
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Stage</th><th className="num">Target</th><th>Counting</th><th>On</th>{user?.isAdmin && <th></th>}</tr></thead>
              <tbody>
                {(targets.data?.targets ?? []).map((t) => {
                  const editing = editTarget?.key === t.key;
                  const row = editing ? editTarget! : t;
                  return (
                    <tr key={t.key}>
                      <td>{t.label}</td>
                      <td className="num">{editing ? <input aria-label="Days" style={{ width: "5rem" }} inputMode="numeric" value={row.days} onChange={(e) => setEditTarget({ ...row, days: Number(e.target.value) || 0 })} /> : `${t.days} day${t.days === 1 ? "" : "s"}`}</td>
                      <td>{editing ? <label><input type="checkbox" checked={row.workingDays} onChange={(e) => setEditTarget({ ...row, workingDays: e.target.checked })} /> Working days only</label> : t.workingDays ? "Working days" : "Calendar days"}</td>
                      <td>{editing ? <input type="checkbox" aria-label="On" checked={row.active} onChange={(e) => setEditTarget({ ...row, active: e.target.checked })} /> : t.active ? "Yes" : "Off"}</td>
                      {user?.isAdmin && (
                        <td>{editing ? (
                          <div className="actions-row">
                            <button type="button" className="btn btn-sm" onClick={() => saveTarget.mutate(row)}>Save</button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
                          </div>
                        ) : <button type="button" className="btn btn-sm btn-secondary" onClick={() => { saveTarget.reset(); setEditTarget(t); }}>Change</button>}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "adjusters" && (
        <div className="card">
          <h2>Adjusters and surveyors</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Kind</th><th>Contact</th><th>Licence</th><th className="num">Open claims</th>{user?.canWrite && <th></th>}</tr></thead>
              <tbody>
                {(adjusters.data?.adjusters ?? []).length === 0 && <tr><td colSpan={6}>No one on the register yet.</td></tr>}
                {(adjusters.data?.adjusters ?? []).map((a) => (
                  <tr key={a.id} style={a.active ? undefined : { opacity: 0.6 }}>
                    <td>{a.name}{a.firm ? <div className="text-muted" style={{ fontSize: "0.8rem" }}>{a.firm}</div> : null}{!a.active && <span className="text-muted"> (inactive)</span>}</td>
                    <td>{a.kind}</td>
                    <td>{[a.phone, a.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{a.licence_no || "—"}</td>
                    <td className="num">{a.open_claims}</td>
                    {user?.canWrite && <td><button type="button" className="btn btn-sm btn-secondary" onClick={() => { saveAdj.reset(); setAdj({ id: a.id, name: a.name, firm: a.firm || "", kind: a.kind, phone: a.phone || "", email: a.email || "", licence_no: a.licence_no || "", notes: a.notes || "", active: Boolean(a.active) }); }}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {user?.canWrite && (
            <>
              <h3 style={{ marginTop: "1.25rem" }}>{adj.id ? `Edit ${adj.name}` : "Add to the register"}</h3>
              {saveAdj.isError && <div className="flash flash-error">{(saveAdj.error as Error).message}</div>}
              <div className="form-grid">
                <div className="field"><label htmlFor="la_name">Name</label><input id="la_name" value={adj.name} onChange={(e) => setAdj({ ...adj, name: e.target.value })} /></div>
                <div className="field"><label htmlFor="la_firm">Firm</label><input id="la_firm" value={adj.firm} onChange={(e) => setAdj({ ...adj, firm: e.target.value })} /></div>
                <div className="field">
                  <label htmlFor="la_kind">Kind</label>
                  <select id="la_kind" value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })}>{(adjusters.data?.kinds ?? ["Loss adjuster", "Surveyor", "Assessor"]).map((k) => <option key={k}>{k}</option>)}</select>
                </div>
                <div className="field"><label htmlFor="la_phone">Phone</label><input id="la_phone" value={adj.phone} onChange={(e) => setAdj({ ...adj, phone: e.target.value })} /></div>
                <div className="field"><label htmlFor="la_email">Email</label><input id="la_email" type="email" value={adj.email} onChange={(e) => setAdj({ ...adj, email: e.target.value })} /></div>
                <div className="field"><label htmlFor="la_lic">Licence no.</label><input id="la_lic" value={adj.licence_no} onChange={(e) => setAdj({ ...adj, licence_no: e.target.value })} /></div>
                {adj.id && <div className="field"><label><input type="checkbox" checked={adj.active} onChange={(e) => setAdj({ ...adj, active: e.target.checked })} /> Active</label></div>}
              </div>
              <div className="actions-row">
                <button type="button" className="btn btn-sm" disabled={!adj.name.trim() || saveAdj.isPending} onClick={() => saveAdj.mutate()}>{adj.id ? "Save changes" : "Add"}</button>
                {adj.id && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAdj({ id: null, ...blankAdjuster })}>Cancel</button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
