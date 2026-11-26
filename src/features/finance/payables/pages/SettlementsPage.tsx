import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";
import { useAuth } from "@/features/platform/auth/AuthContext";

// Finance > Insurer settlements (backend finance/payables/insurerSettlements.js). A settlement batches the premium
// received for one insurer in a period, net of brokerage, to pay over. Draft (add or remove policies) -> Submitted ->
// Paid (date, bank reference; the approver's limit applies) -> Reconciled against the insurer's statement totals.

interface Settlement {
  id: number;
  insurer_id: number;
  insurer_name: string;
  period_start: string;
  period_end: string;
  status: string;
  statement_reference: string | null;
  payment_reference: string | null;
  paid_date: string | null;
  approved_by: string | null;
  variance_reason: string | null;
  line_count?: number;
  net_premium?: number;
}
interface Line { id: number; transaction_id: number; policy_no: string | null; client_name: string; trans_date: string; gross_premium: number; commission: number; net_premium: number }
interface Eligible { id: number; policy_no: string | null; client_name: string; trans_date: string; class_of_business: string | null; premium_due: number; total_brokerage: number; net_premium: number }
interface Detail { settlement: Settlement; totals: { line_count: number; gross_premium: number; commission: number; net_premium: number }; lines: Line[]; moves: string[] }

const BADGE: Record<string, string> = { Draft: "badge", Submitted: "badge badge-warning", "Partially Paid": "badge badge-secondary", Paid: "badge badge-paid", Reconciled: "badge badge-paid" };
const today = () => new Date().toISOString().slice(0, 10);

export function SettlementsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("id")) || null;
  const listQuery = useQuery({ queryKey: ["settlements"], queryFn: () => api.get<{ settlements: Settlement[]; insurers: { id: number; name: string }[] }>("/api/settlements") });
  const detailQuery = useQuery({ queryKey: ["settlements", selected], enabled: !!selected, queryFn: () => api.get<Detail>(`/api/settlements/${selected}`) });
  const detail = detailQuery.data;
  const isDraft = detail?.settlement.status === "Draft";
  const eligibleQuery = useQuery({ queryKey: ["settlements", selected, "eligible"], enabled: !!selected && isDraft, queryFn: () => api.get<{ lines: Eligible[] }>(`/api/settlements/${selected}/eligible`) });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ insurer_id: "", period_start: "", period_end: "", statement_reference: "" });
  const [picked, setPicked] = useState<number[]>([]);
  const [move, setMove] = useState<string | null>(null);
  const [pay, setPay] = useState({ paid_date: today(), payment_reference: "" });
  const [reconciling, setReconciling] = useState(false);
  const [recon, setRecon] = useState({ statement_gross_premium: "", statement_commission: "", statement_net_premium: "", variance_reason: "" });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settlements"] });
  const create = useMutation({
    mutationFn: () => api.post<{ settlementId: number }>("/api/settlements", form),
    onSuccess: (res) => { setCreating(false); setParams({ id: String(res.settlementId) }); void refresh(); },
  });
  const addLines = useMutation({
    mutationFn: () => api.post(`/api/settlements/${selected}/lines`, { transaction_ids: picked }),
    onSuccess: () => { setPicked([]); void refresh(); },
  });
  const removeLine = useMutation({ mutationFn: (lineId: number) => api.delete(`/api/settlements/${selected}/lines/${lineId}`), onSuccess: () => void refresh() });
  const doMove = useMutation({
    mutationFn: () => api.post(`/api/settlements/${selected}/status`, { status: move, ...pay }),
    onSuccess: () => { setMove(null); void refresh(); },
  });
  const reconcile = useMutation({
    mutationFn: () => api.post(`/api/settlements/${selected}/reconcile`, recon),
    onSuccess: () => { setReconciling(false); void refresh(); },
  });

  const settlements = listQuery.data?.settlements ?? [];
  const eligible = eligibleQuery.data?.lines ?? [];
  const pickedTotal = eligible.filter((e) => picked.includes(e.id)).reduce((s, e) => s + e.net_premium, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Insurer settlements</h1>
          <p className="text-muted">Premium received for an insurer in a period, net of our brokerage, gathered into one payment. Policies are added while the settlement is a draft.</p>
        </div>
        {user?.canWrite && <button type="button" className="btn" onClick={() => { create.reset(); setCreating(true); }}>New settlement</button>}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Insurer</th><th>Period</th><th className="num">Policies</th><th className="num">Net premium</th><th>Status</th></tr></thead>
            <tbody>
              {listQuery.isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
              {!listQuery.isLoading && settlements.length === 0 && <tr><td colSpan={5}>No settlements yet.</td></tr>}
              {settlements.map((s) => (
                <tr key={s.id}>
                  <td><button type="button" className="link-button" onClick={() => setParams({ id: String(s.id) })}>{s.insurer_name}</button></td>
                  <td>{s.period_start} to {s.period_end}</td>
                  <td className="num">{s.line_count ?? 0}</td>
                  <td className="num">{fmtMoney(s.net_premium ?? 0)}</td>
                  <td><span className={BADGE[s.status] || "badge"}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && detail && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: 0 }}>{detail.settlement.insurer_name}, {detail.settlement.period_start} to {detail.settlement.period_end}</h2>
              <p className="text-muted" style={{ margin: "0.25rem 0 0" }}>
                <span className={BADGE[detail.settlement.status] || "badge"}>{detail.settlement.status}</span>
                {detail.settlement.paid_date && <> Paid {detail.settlement.paid_date}, ref {detail.settlement.payment_reference}{detail.settlement.approved_by ? ` (by ${detail.settlement.approved_by})` : ""}.</>}
                {detail.settlement.variance_reason && <> Variance: {detail.settlement.variance_reason}</>}
              </p>
            </div>
            {user?.canWrite && (
              <div className="actions-row">
                {detail.moves.map((m) => (
                  <button key={m} type="button" className={m === "Draft" ? "btn btn-sm btn-secondary" : "btn btn-sm"} onClick={() => { doMove.reset(); setPay({ paid_date: today(), payment_reference: "" }); setMove(m); }}>
                    {m === "Draft" ? "Back to draft" : m === "Submitted" ? "Submit to insurer" : `Mark ${m.toLowerCase()}`}
                  </button>
                ))}
                {detail.settlement.status === "Paid" && <button type="button" className="btn btn-sm" onClick={() => { reconcile.reset(); setReconciling(true); }}>Reconcile with statement</button>}
              </div>
            )}
          </div>
          {removeLine.isError && <div className="flash flash-error">{(removeLine.error as Error).message}</div>}
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data-table">
              <thead><tr><th>Policy</th><th>Client</th><th>Date</th><th className="num">Gross premium</th><th className="num">Brokerage</th><th className="num">Net to insurer</th>{isDraft && user?.canWrite && <th></th>}</tr></thead>
              <tbody>
                {detail.lines.length === 0 && <tr><td colSpan={7}>No policies on this settlement yet.</td></tr>}
                {detail.lines.map((l) => (
                  <tr key={l.id}>
                    <td><Link to={`/transactions/${l.transaction_id}`}>{l.policy_no || `#${l.transaction_id}`}</Link></td>
                    <td>{l.client_name}</td>
                    <td>{l.trans_date}</td>
                    <td className="num">{fmtMoney(l.gross_premium)}</td>
                    <td className="num">{fmtMoney(l.commission)}</td>
                    <td className="num">{fmtMoney(l.net_premium)}</td>
                    {isDraft && user?.canWrite && <td><button type="button" className="btn btn-sm btn-secondary" onClick={() => removeLine.mutate(l.id)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={3}>Total</th><th className="num">{fmtMoney(detail.totals.gross_premium)}</th><th className="num">{fmtMoney(detail.totals.commission)}</th><th className="num">{fmtMoney(detail.totals.net_premium)}</th>{isDraft && user?.canWrite && <th></th>}</tr>
              </tfoot>
            </table>
          </div>

          {isDraft && user?.canWrite && (
            <>
              <h3 style={{ marginTop: "1.25rem" }}>Paid policies not yet settled</h3>
              {addLines.isError && <div className="flash flash-error">{(addLines.error as Error).message}</div>}
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th></th><th>Policy</th><th>Client</th><th>Class</th><th>Date</th><th className="num">Net to insurer</th></tr></thead>
                  <tbody>
                    {eligibleQuery.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
                    {!eligibleQuery.isLoading && eligible.length === 0 && <tr><td colSpan={6}>Every paid policy of this insurer in the period is already on a settlement.</td></tr>}
                    {eligible.map((e) => (
                      <tr key={e.id}>
                        <td><input type="checkbox" aria-label={`Add ${e.policy_no || e.id}`} checked={picked.includes(e.id)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, e.id] : picked.filter((p) => p !== e.id))} /></td>
                        <td>{e.policy_no || `#${e.id}`}</td>
                        <td>{e.client_name}</td>
                        <td>{e.class_of_business || "—"}</td>
                        <td>{e.trans_date}</td>
                        <td className="num">{fmtMoney(e.net_premium)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions-row" style={{ marginTop: "0.5rem" }}>
                {eligible.length > 0 && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPicked(picked.length === eligible.length ? [] : eligible.map((e) => e.id))}>{picked.length === eligible.length ? "Clear" : "Select all"}</button>}
                <button type="button" className="btn btn-sm" disabled={!picked.length || addLines.isPending} onClick={() => addLines.mutate()}>
                  Add {picked.length || ""} polic{picked.length === 1 ? "y" : "ies"}{picked.length ? ` (${fmtMoney(pickedTotal)})` : ""}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <Modal open={creating} title="New insurer settlement" onClose={() => setCreating(false)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
        <button type="button" className="btn" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Create"}</button>
      </>}>
        {create.isError && <div className="flash flash-error">{(create.error as Error).message}</div>}
        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="st_insurer">Insurer</label>
            <select id="st_insurer" value={form.insurer_id} onChange={(e) => setForm({ ...form, insurer_id: e.target.value })}>
              <option value="">Choose…</option>
              {(listQuery.data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="st_from">From</label><input id="st_from" type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
          <div className="field"><label htmlFor="st_to">To</label><input id="st_to" type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="st_ref">Insurer's statement reference (optional)</label><input id="st_ref" value={form.statement_reference} onChange={(e) => setForm({ ...form, statement_reference: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={move !== null} title={move === "Draft" ? "Back to draft" : move === "Submitted" ? "Submit to insurer" : `Mark ${move?.toLowerCase()}`} onClose={() => setMove(null)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setMove(null)}>Cancel</button>
        <button type="button" className="btn" disabled={doMove.isPending || ((move === "Paid" || move === "Partially Paid") && !pay.payment_reference.trim())} onClick={() => doMove.mutate()}>{doMove.isPending ? "Saving…" : "Confirm"}</button>
      </>}>
        {doMove.isError && <div className="flash flash-error">{(doMove.error as Error).message}</div>}
        {detail && <p style={{ marginTop: 0 }}>{detail.totals.line_count} polic{detail.totals.line_count === 1 ? "y" : "ies"}, {fmtMoney(detail.totals.net_premium)} net to {detail.settlement.insurer_name}.</p>}
        {(move === "Paid" || move === "Partially Paid") && (
          <div className="form-grid">
            <div className="field"><label htmlFor="st_paid">Date paid</label><input id="st_paid" type="date" value={pay.paid_date} max={today()} onChange={(e) => setPay({ ...pay, paid_date: e.target.value })} /></div>
            <div className="field"><label htmlFor="st_payref">Bank transfer reference</label><input id="st_payref" value={pay.payment_reference} onChange={(e) => setPay({ ...pay, payment_reference: e.target.value })} /></div>
          </div>
        )}
      </Modal>

      <Modal open={reconciling} title="Reconcile with the insurer's statement" onClose={() => setReconciling(false)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setReconciling(false)}>Cancel</button>
        <button type="button" className="btn" disabled={reconcile.isPending} onClick={() => reconcile.mutate()}>{reconcile.isPending ? "Saving…" : "Reconcile"}</button>
      </>}>
        {reconcile.isError && <div className="flash flash-error">{(reconcile.error as Error).message}</div>}
        {detail && <p style={{ marginTop: 0 }}>Our totals: gross {fmtMoney(detail.totals.gross_premium)}, brokerage {fmtMoney(detail.totals.commission)}, net {fmtMoney(detail.totals.net_premium)}.</p>}
        <div className="form-grid">
          <div className="field"><label htmlFor="rc_g">Statement gross premium</label><input id="rc_g" inputMode="decimal" value={recon.statement_gross_premium} onChange={(e) => setRecon({ ...recon, statement_gross_premium: e.target.value })} /></div>
          <div className="field"><label htmlFor="rc_c">Statement brokerage</label><input id="rc_c" inputMode="decimal" value={recon.statement_commission} onChange={(e) => setRecon({ ...recon, statement_commission: e.target.value })} /></div>
          <div className="field"><label htmlFor="rc_n">Statement net premium</label><input id="rc_n" inputMode="decimal" value={recon.statement_net_premium} onChange={(e) => setRecon({ ...recon, statement_net_premium: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="rc_v">Reason for any difference</label><textarea id="rc_v" rows={2} value={recon.variance_reason} onChange={(e) => setRecon({ ...recon, variance_reason: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
