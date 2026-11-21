import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { kobo, type ReconException, type StatementDetail, type StatementLine } from "../lib/premiumStatements";
import { promptDialog } from "@/shared/components/Dialogs";

interface Candidate { id: number; policy_no: string; debit_note_no: string | null; trans_date: string; premium_due: number; brokerage: number; client_name: string }

const LINE_BADGE: Record<StatementLine["match_status"], string> = {
  Matched: "badge-paid", Discrepancy: "badge-warning", Unmatched: "badge-unpaid", Ambiguous: "badge-unpaid", Ignored: "badge-cancelled",
};

/** One premium statement: its lines against our books, the exceptions it raised, and reconcile / void. */
export function PremiumStatementDetailPage() {
  const { statementId } = useParams();
  const queryClient = useQueryClient();
  const key = ["premium-statements", statementId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<StatementDetail>(`/api/premium-statements/${statementId}`) });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [closing, setClosing] = useState<{ id: number; action: "resolve" | "waive" } | null>(null);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function act(fn: () => Promise<unknown>, done: string) {
    setFlash(null);
    try {
      await fn();
      setFlash({ ok: true, text: done });
      setPicking(null);
      setClosing(null);
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["premium-statements"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "That did not work." });
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <div className="flash flash-error">{error instanceof ApiError ? error.message : "Statement not found."}</div>;
  const { statement: s, lines, exceptions } = data;
  const open = s.status === "Open";
  const openEx = exceptions.filter((e) => e.status === "Open");
  const shownEx = showAll ? exceptions : openEx;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/premium-statements">Premium Statements</Link></p>
          <h1>{s.insurer_name}: {s.statement_ref || s.file_name || `statement #${s.id}`}</h1>
          <p style={{ color: "var(--text-muted)" }}>
            {s.period_start ? `Period ${s.period_start} to ${s.period_end}. ` : "No period given. "}
            Imported by {s.created_by} on {String(s.created_at).slice(0, 10)}. <StatusBadge status={s.status} />
          </p>
        </div>
        <RoleGate need="write">
          <div className="page-header-actions">
            {open && (
              <button type="button" className="btn" disabled={openEx.length > 0} title={openEx.length ? "Close every exception first" : ""}
                onClick={async () => { const note = await promptDialog({ title: "Reconcile statement", message: "Note for the reconciliation (optional)", multiline: true, confirmLabel: "Reconcile" }); if (note === null) return; void act(() => api.post(`/api/premium-statements/${s.id}/reconcile`, { note }), "Statement reconciled."); }}>
                Mark reconciled
              </button>
            )}
            {s.status !== "Void" && (
              <button type="button" className="btn btn-secondary"
                onClick={async () => { const reason = await promptDialog({ message: "Why void this statement?", required: true, multiline: true }); if (reason) void act(() => api.post(`/api/premium-statements/${s.id}/void`, { reason }), "Statement voided."); }}>
                Void
              </button>
            )}
          </div>
        </RoleGate>
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}
      {s.void_reason && <div className="flash flash-error">Voided: {s.void_reason}</div>}

      <div className="kpi-row">
        <div className="card kpi-card"><span className="kpi-label">Gross on statement</span><span className="kpi-value">{kobo(s.gross_cents)}</span></div>
        <div className="card kpi-card"><span className="kpi-label">Commission on statement</span><span className="kpi-value">{kobo(s.commission_cents)}</span></div>
        <div className="card kpi-card"><span className="kpi-label">Net on statement</span><span className="kpi-value">{kobo(s.net_cents)}</span></div>
        <div className="card kpi-card"><span className="kpi-label">Open exceptions</span><span className="kpi-value">{openEx.length}</span></div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Exceptions</h2>
          <label><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show closed ones too</label>
        </div>
        {shownEx.length === 0 ? <p style={{ color: "var(--text-muted)" }}>{showAll ? "None." : "Nothing open."}</p> : (
          <div className="table-wrap">
            <table className="data-grid-table">
              <thead><tr><th>Policy</th><th>Exception</th><th className="num">Our books</th><th className="num">Statement</th><th className="num">Difference</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shownEx.map((e: ReconException) => (
                  <tr key={e.id}>
                    <td>{e.transaction_id ? <Link to={`/transactions/${e.transaction_id}`}>{e.policy_no}</Link> : e.policy_no}</td>
                    <td>{e.label}</td>
                    <td className="num">{kobo(e.expected_cents)}</td>
                    <td className="num">{kobo(e.actual_cents)}</td>
                    <td className="num">{kobo(e.difference_cents)}</td>
                    <td><StatusBadge status={e.status} />{e.resolution_note && <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{e.resolution_note}{e.resolved_by ? ` (${e.resolved_by})` : ""}</div>}</td>
                    <td>
                      {open && e.status === "Open" && !["unmatched_line", "ambiguous_line"].includes(e.exception_type) && (
                        <RoleGate need="write">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClosing({ id: e.id, action: "resolve" })}>Resolve</button>{" "}
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClosing({ id: e.id, action: "waive" })}>Waive</button>
                        </RoleGate>
                      )}
                      {open && e.status === "Open" && ["unmatched_line", "ambiguous_line"].includes(e.exception_type) && (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Match or ignore the line below</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {closing && (
          <div className="form-grid">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="ex-note">{closing.action === "resolve" ? "How was it resolved? (e.g. the insurer corrected its statement)" : "Why is the difference accepted?"}</label>
              <input id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="toolbar">
              <button type="button" className="btn" disabled={!note.trim()} onClick={() => act(() => api.post(`/api/premium-statements/exceptions/${closing.id}`, { action: closing.action, note }), closing.action === "resolve" ? "Resolved." : "Waived.")}>
                {closing.action === "resolve" ? "Resolve" : "Waive"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setClosing(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Lines</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Amounts are the statement's; where our books differ by more than ₦1, our figure is shown underneath in red.</p>
        <div className="table-wrap">
          <table className="data-grid-table">
            <thead><tr><th>Row</th><th>Policy on statement</th><th>Our policy</th><th className="num">Gross</th><th className="num">Commission</th><th className="num">Net</th><th>Match</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.id} line={l} canEdit={open} picking={picking === l.id} onPick={() => setPicking(picking === l.id ? null : l.id)}
                  statementId={s.id} onDone={(fn, msg) => act(fn, msg)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const pair = (stmt: number | null, ours: number | null) => (
  <>{kobo(stmt)}{ours != null && stmt != null && Math.abs(stmt - ours) > 100 && <div style={{ color: "var(--status-critical)", fontSize: "0.8rem" }}>ours {kobo(ours)}</div>}</>
);

function LineRow({ line: l, canEdit, picking, onPick, statementId, onDone }: {
  line: StatementLine; canEdit: boolean; picking: boolean; onPick: () => void; statementId: number;
  onDone: (fn: () => Promise<unknown>, msg: string) => void;
}) {
  const [q, setQ] = useState(l.policy_no);
  const [ignoreNote, setIgnoreNote] = useState("");
  const results = useQuery({
    queryKey: ["premium-statements", statementId, "candidates", q],
    queryFn: () => api.get<{ candidates: Candidate[] }>(`/api/premium-statements/${statementId}/candidates?q=${encodeURIComponent(q)}`),
    enabled: picking && q.trim().length >= 2,
  });
  return (
    <>
      <tr>
        <td>{l.row_no}</td>
        <td>{l.policy_no}{l.insured_name && <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{l.insured_name}</div>}</td>
        <td>{l.transaction_id ? <Link to={`/transactions/${l.transaction_id}`}>{l.matched_policy_no}</Link> : "—"}{l.client_name && <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{l.client_name}</div>}</td>
        <td className="num">{pair(l.gross_cents, l.expected_gross_cents)}</td>
        <td className="num">{pair(l.commission_cents, l.expected_commission_cents)}</td>
        <td className="num">{pair(l.net_cents, l.expected_net_cents)}</td>
        <td><span className={`badge ${LINE_BADGE[l.match_status]}`}>{l.match_status}</span>{l.match_method && <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{l.match_method}</div>}{l.note && <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{l.note}</div>}</td>
        <td>{canEdit && <RoleGate need="write"><button type="button" className="btn btn-secondary btn-sm" onClick={onPick}>{picking ? "Close" : "Change"}</button></RoleGate>}</td>
      </tr>
      {picking && (
        <tr>
          <td colSpan={8}>
            <div className="toolbar">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Policy no, debit note or client" aria-label="Search policies" />
              <input value={ignoreNote} onChange={(e) => setIgnoreNote(e.target.value)} placeholder="Or: why ignore this line" aria-label="Ignore reason" />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!ignoreNote.trim()}
                onClick={() => onDone(() => api.post(`/api/premium-statements/${statementId}/lines/${l.id}`, { ignore: true, note: ignoreNote }), "Line ignored.")}>Ignore line</button>
            </div>
            {(results.data?.candidates ?? []).map((c) => (
              <div key={c.id} className="toolbar" style={{ justifyContent: "space-between" }}>
                <span>{c.policy_no} · {c.client_name} · {c.trans_date} · DN {c.debit_note_no || "—"} · premium {kobo(Math.round(c.premium_due * 100))}</span>
                <button type="button" className="btn btn-sm" onClick={() => onDone(() => api.post(`/api/premium-statements/${statementId}/lines/${l.id}`, { transaction_id: c.id }), `Matched to ${c.policy_no}.`)}>Use this policy</button>
              </div>
            ))}
            {results.data && results.data.candidates.length === 0 && <p style={{ color: "var(--text-muted)" }}>No policy of this insurer matches.</p>}
          </td>
        </tr>
      )}
    </>
  );
}
