import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";
import { useAuth } from "@/features/platform/auth/AuthContext";

// Finance > Producer commission (backend finance/payables/producerPayables.js). A payable gathers a producer's
// commission split shares (the split rows that name them on the policy's Commission splits tab) for a period. Draft
// (add or remove policies) -> Approved (someone other than who raised it, within their approval limit) -> Paid (date and
// bank reference). A producer is paid on a policy once.

interface Payable { id: number; producer_id: number; producer_name: string; period_start: string; period_end: string; status: string; created_by: string | null; approved_by: string | null; paid_date: string | null; payment_reference: string | null; line_count?: number; total_commission?: number }
interface Line { id: number; transaction_id: number; policy_no: string | null; client_name: string | null; class_of_business: string | null; trans_date: string; commission_amount: number }
interface Eligible { transaction_id: number; policy_no: string | null; client_name: string | null; class_of_business: string | null; trans_date: string; endorsement: boolean; split_types: string[]; total_brokerage: number; commission_amount: number }
interface Detail { payable: Payable; lines: Line[]; total: number }

const BADGE: Record<string, string> = { Draft: "badge", Approved: "badge badge-warning", Paid: "badge badge-paid" };
const SPLIT_LABEL: Record<string, string> = { WritingAgent: "Writing agent", Referral: "Referral", Agency: "Agency", Other: "Other" };
const today = () => new Date().toISOString().slice(0, 10);

export function ProducerPayablesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("id")) || null;
  const listQuery = useQuery({ queryKey: ["producer-payables"], queryFn: () => api.get<{ payables: Payable[]; producers: { id: number; name: string; active: number }[] }>("/api/producer-payables") });
  const detailQuery = useQuery({ queryKey: ["producer-payables", selected], enabled: !!selected, queryFn: () => api.get<Detail>(`/api/producer-payables/${selected}`) });
  const detail = detailQuery.data;
  const status = detail?.payable.status;
  const isDraft = status === "Draft";
  const eligibleQuery = useQuery({ queryKey: ["producer-payables", selected, "eligible"], enabled: !!selected && isDraft, queryFn: () => api.get<{ lines: Eligible[] }>(`/api/producer-payables/${selected}/eligible`) });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ producer_id: "", period_start: "", period_end: "", notes: "" });
  const [picked, setPicked] = useState<number[]>([]);
  const [move, setMove] = useState<string | null>(null);
  const [pay, setPay] = useState({ paid_date: today(), payment_reference: "" });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["producer-payables"] });
  const create = useMutation({
    mutationFn: () => api.post<{ payableId: number }>("/api/producer-payables", form),
    onSuccess: (res) => { setCreating(false); setParams({ id: String(res.payableId) }); void refresh(); },
  });
  const addLines = useMutation({ mutationFn: () => api.post(`/api/producer-payables/${selected}/lines`, { transaction_ids: picked }), onSuccess: () => { setPicked([]); void refresh(); } });
  const removeLine = useMutation({ mutationFn: (lineId: number) => api.delete(`/api/producer-payables/${selected}/lines/${lineId}`), onSuccess: () => void refresh() });
  const doMove = useMutation({ mutationFn: () => api.post(`/api/producer-payables/${selected}/status`, { status: move, ...pay }), onSuccess: () => { setMove(null); void refresh(); } });

  const payables = listQuery.data?.payables ?? [];
  const eligible = eligibleQuery.data?.lines ?? [];
  const pickedTotal = eligible.filter((e) => picked.includes(e.transaction_id)).reduce((s, e) => s + e.commission_amount, 0);
  const moves = status === "Draft" ? ["Approved"] : status === "Approved" ? ["Draft", "Paid"] : [];
  const ownPayable = (detail?.payable.created_by || "").toLowerCase() === (user?.username || "").toLowerCase();

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Producer commission</h1>
          <p className="text-muted">
            Producers are paid their commission split share on each policy: the split rows that name them on the policy's
            Commission splits tab. A policy with no split for a producer pays them nothing.
          </p>
        </div>
        {user?.canWrite && <button type="button" className="btn" onClick={() => { create.reset(); setCreating(true); }}>New payable</button>}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Producer</th><th>Period</th><th className="num">Policies</th><th className="num">Commission</th><th>Status</th></tr></thead>
            <tbody>
              {listQuery.isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
              {!listQuery.isLoading && payables.length === 0 && <tr><td colSpan={5}>No producer payables yet.</td></tr>}
              {payables.map((p) => (
                <tr key={p.id}>
                  <td><button type="button" className="link-button" onClick={() => setParams({ id: String(p.id) })}>{p.producer_name}</button></td>
                  <td>{p.period_start} to {p.period_end}</td>
                  <td className="num">{p.line_count ?? 0}</td>
                  <td className="num">{fmtMoney(p.total_commission ?? 0)}</td>
                  <td><span className={BADGE[p.status] || "badge"}>{p.status}</span></td>
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
              <h2 style={{ margin: 0 }}>{detail.payable.producer_name}, {detail.payable.period_start} to {detail.payable.period_end}</h2>
              <p className="text-muted" style={{ margin: "0.25rem 0 0" }}>
                <span className={BADGE[detail.payable.status] || "badge"}>{detail.payable.status}</span>
                {detail.payable.created_by && <> Raised by {detail.payable.created_by}.</>}
                {detail.payable.approved_by && <> Approved by {detail.payable.approved_by}.</>}
                {detail.payable.paid_date && <> Paid {detail.payable.paid_date}, ref {detail.payable.payment_reference}.</>}
              </p>
            </div>
            {user?.canWrite && (
              <div className="actions-row">
                {moves.map((m) => (
                  <button key={m} type="button" className={m === "Draft" ? "btn btn-sm btn-secondary" : "btn btn-sm"} disabled={m === "Approved" && ownPayable}
                    title={m === "Approved" && ownPayable ? "Someone other than the person who raised it approves it" : undefined}
                    onClick={() => { doMove.reset(); setPay({ paid_date: today(), payment_reference: "" }); setMove(m); }}>
                    {m === "Draft" ? "Back to draft" : m === "Approved" ? "Approve" : "Record payment"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {removeLine.isError && <div className="flash flash-error">{(removeLine.error as Error).message}</div>}
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data-table">
              <thead><tr><th>Policy</th><th>Client</th><th>Class</th><th>Date</th><th className="num">Commission</th>{isDraft && user?.canWrite && <th></th>}</tr></thead>
              <tbody>
                {detail.lines.length === 0 && <tr><td colSpan={6}>No policies on this payable yet.</td></tr>}
                {detail.lines.map((l) => (
                  <tr key={l.id}>
                    <td><Link to={`/transactions/${l.transaction_id}`}>{l.policy_no || `#${l.transaction_id}`}</Link></td>
                    <td>{l.client_name || "—"}</td>
                    <td>{l.class_of_business || "—"}</td>
                    <td>{l.trans_date}</td>
                    <td className="num">{fmtMoney(l.commission_amount)}</td>
                    {isDraft && user?.canWrite && <td><button type="button" className="btn btn-sm btn-secondary" onClick={() => removeLine.mutate(l.id)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={4}>Total</th><th className="num">{fmtMoney(detail.total)}</th>{isDraft && user?.canWrite && <th></th>}</tr></tfoot>
            </table>
          </div>

          {isDraft && user?.canWrite && (
            <>
              <h3 style={{ marginTop: "1.25rem" }}>Commission shares not yet paid</h3>
              {addLines.isError && <div className="flash flash-error">{(addLines.error as Error).message}</div>}
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th></th><th>Policy</th><th>Client</th><th>Date</th><th>Share</th><th className="num">Commission</th></tr></thead>
                  <tbody>
                    {eligibleQuery.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
                    {!eligibleQuery.isLoading && eligible.length === 0 && <tr><td colSpan={6}>No unpaid commission split names this producer in the period.</td></tr>}
                    {eligible.map((e) => (
                      <tr key={e.transaction_id}>
                        <td><input type="checkbox" aria-label={`Add ${e.policy_no || e.transaction_id}`} checked={picked.includes(e.transaction_id)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, e.transaction_id] : picked.filter((p) => p !== e.transaction_id))} /></td>
                        <td>{e.policy_no || `#${e.transaction_id}`}{e.endorsement && <span className="text-muted"> (endorsement)</span>}</td>
                        <td>{e.client_name || "—"}</td>
                        <td>{e.trans_date}</td>
                        <td>{e.split_types.map((t) => SPLIT_LABEL[t] || t).join(", ")}</td>
                        <td className="num">{fmtMoney(e.commission_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions-row" style={{ marginTop: "0.5rem" }}>
                {eligible.length > 0 && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPicked(picked.length === eligible.length ? [] : eligible.map((e) => e.transaction_id))}>{picked.length === eligible.length ? "Clear" : "Select all"}</button>}
                <button type="button" className="btn btn-sm" disabled={!picked.length || addLines.isPending} onClick={() => addLines.mutate()}>
                  Add {picked.length || ""} polic{picked.length === 1 ? "y" : "ies"}{picked.length ? ` (${fmtMoney(pickedTotal)})` : ""}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <Modal open={creating} title="New producer payable" onClose={() => setCreating(false)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
        <button type="button" className="btn" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Create"}</button>
      </>}>
        {create.isError && <div className="flash flash-error">{(create.error as Error).message}</div>}
        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="pp_producer">Producer</label>
            <select id="pp_producer" value={form.producer_id} onChange={(e) => setForm({ ...form, producer_id: e.target.value })}>
              <option value="">Choose…</option>
              {(listQuery.data?.producers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inactive)"}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="pp_from">From</label><input id="pp_from" type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
          <div className="field"><label htmlFor="pp_to">To</label><input id="pp_to" type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="pp_notes">Notes (optional)</label><input id="pp_notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={move !== null} title={move === "Draft" ? "Back to draft" : move === "Approved" ? "Approve payable" : "Record payment"} onClose={() => setMove(null)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setMove(null)}>Cancel</button>
        <button type="button" className="btn" disabled={doMove.isPending || (move === "Paid" && !pay.payment_reference.trim())} onClick={() => doMove.mutate()}>{doMove.isPending ? "Saving…" : "Confirm"}</button>
      </>}>
        {doMove.isError && <div className="flash flash-error">{(doMove.error as Error).message}</div>}
        {detail && <p style={{ marginTop: 0 }}>{detail.lines.length} polic{detail.lines.length === 1 ? "y" : "ies"}, {fmtMoney(detail.total)} to {detail.payable.producer_name}.</p>}
        {move === "Paid" && (
          <div className="form-grid">
            <div className="field"><label htmlFor="pp_paid">Date paid</label><input id="pp_paid" type="date" value={pay.paid_date} max={today()} onChange={(e) => setPay({ ...pay, paid_date: e.target.value })} /></div>
            <div className="field"><label htmlFor="pp_ref">Bank transfer reference</label><input id="pp_ref" value={pay.payment_reference} onChange={(e) => setPay({ ...pay, payment_reference: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
