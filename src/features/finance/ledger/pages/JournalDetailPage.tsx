import "@/shared/styles/ledger.css";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { KIND_LABEL, SOURCE_LABEL, fmtMinor, fmtMinorOrBlank, type JournalDetail } from "../api/ledger";
import { confirmDialog } from "@/shared/components/Dialogs";

/** One journal: its lines, where it came from, and the approve / reject / reverse actions the caller may take. */
export function JournalDetailPage() {
  const { journalId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "journal", journalId],
    queryFn: () => api.get<{ journal: JournalDetail; can: { edit: boolean; approve: boolean; reverse: boolean } }>(`/api/gl/journals/${journalId}`),
  });
  const [action, setAction] = useState<"reject" | "reverse" | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setFlash(null);
    try {
      await fn();
      setFlash({ ok: true, text: done });
      setAction(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "That did not work." });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <div className="flash flash-error">{error instanceof ApiError ? error.message : "Journal not found."}</div>;
  const j = data.journal;
  const foreign = j.currency !== "NGN";
  const totalDebit = j.lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredit = j.lines.reduce((s, l) => s + l.creditCents, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/ledger/journals">Journals</Link></p>
          <h1>{j.journal_no ?? `Draft journal #${j.id}`}</h1>
          <p className="ledger-intro">{j.description}</p>
        </div>
        <div className="page-header-actions">
          {data.can.edit && <Link to={`/ledger/journals/${j.id}/edit`} className="btn btn-secondary">Edit draft</Link>}
          {data.can.edit && (
            <button type="button" className="btn btn-danger" disabled={busy}
              onClick={async () => { if (await confirmDialog("Discard this draft journal?")) void run(() => api.delete(`/api/gl/journals/${j.id}`), "Discarded.").then(() => navigate("/ledger/journals")); }}>
              Discard
            </button>
          )}
          {data.can.approve && (
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.post(`/api/gl/journals/${j.id}/approve`), "Approved and posted.")}>Approve and post</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAction("reject")}>Reject</button>
            </>
          )}
          {data.can.reverse && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAction("reverse")}>Reverse</button>}
        </div>
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}

      {action && (
        <div className="card">
          <h2>{action === "reject" ? "Reject this draft" : "Reverse this journal"}</h2>
          <p className="ledger-note">
            {action === "reject"
              ? "The draft stays on file as rejected. The person who drafted it can start a new one."
              : "A mirror-image journal is posted and linked to this one. Nothing is deleted."}
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="gl-reason">Reason</label>
              <input id="gl-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {action === "reverse" && (
              <div className="field">
                <label htmlFor="gl-rev-date">Reversal date (blank: the journal's date, or today if that month is closed)</label>
                <input id="gl-rev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
          </div>
          <div className="toolbar">
            <button type="button" className="btn" disabled={busy || !reason.trim()}
              onClick={() => run(() => api.post(`/api/gl/journals/${j.id}/${action}`, { reason, date: date || undefined }), action === "reject" ? "Rejected." : "Reversed.")}>
              {action === "reject" ? "Reject" : "Post reversal"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <dl className="detail-grid">
          <div><dt>Status</dt><dd><StatusBadge status={j.status === "Draft" ? "Awaiting approval" : j.status} /></dd></div>
          <div><dt>Date</dt><dd>{j.journal_date}</dd></div>
          <div><dt>Kind</dt><dd>{KIND_LABEL[j.kind]}</dd></div>
          <div><dt>Amount</dt><dd>{fmtMinor(j.total_cents)}</dd></div>
          {j.source_type && (
            <div><dt>From</dt><dd>{j.sourceLink ? <Link to={j.sourceLink}>{SOURCE_LABEL[j.source_type] ?? j.source_type} #{j.source_id}</Link> : `${SOURCE_LABEL[j.source_type] ?? j.source_type} #${j.source_id}`}</dd></div>
          )}
          {foreign && <div><dt>Currency</dt><dd>{j.currency} at ₦{(j.fx_rate_micro / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} (CBN rate of {j.fx_rate_date})</dd></div>}
          <div><dt>Drafted by</dt><dd>{j.created_by === "system:ledger" ? "Automatic" : j.created_by}</dd></div>
          {j.approved_by && <div><dt>{j.status === "Rejected" ? "Rejected by" : "Approved by"}</dt><dd>{j.approved_by === "system:ledger" ? "Automatic" : j.approved_by}</dd></div>}
          {j.reason && <div><dt>Reason</dt><dd>{j.reason}</dd></div>}
          {j.reversalOf && <div><dt>Reverses</dt><dd><Link to={`/ledger/journals/${j.reversalOf.id}`}>{j.reversalOf.journal_no}</Link></dd></div>}
          {j.reversedBy && <div><dt>Reversed by</dt><dd><Link to={`/ledger/journals/${j.reversedBy.id}`}>{j.reversedBy.journal_no}</Link></dd></div>}
        </dl>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-grid-table ledger-statement">
            <thead>
              <tr>
                <th>Account</th>
                <th>Details</th>
                {foreign && <th className="num">Debit ({j.currency})</th>}
                {foreign && <th className="num">Credit ({j.currency})</th>}
                <th className="num">Debit (NGN)</th>
                <th className="num">Credit (NGN)</th>
              </tr>
            </thead>
            <tbody>
              {j.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="ledger-code">{l.accountCode}</span> {l.accountName}
                    {l.classification === "Fiduciary" && <span className="badge badge-warning ledger-tag">Client money</span>}
                  </td>
                  <td>
                    {[l.memo, l.clientName, l.insurerName].filter(Boolean).join(" · ")}
                    {l.transactionId && <> · <Link to={`/transactions/${l.transactionId}`}>policy</Link></>}
                  </td>
                  {foreign && <td className="num">{fmtMinorOrBlank(l.foreignDebitMinor, j.currency)}</td>}
                  {foreign && <td className="num">{fmtMinorOrBlank(l.foreignCreditMinor, j.currency)}</td>}
                  <td className="num">{fmtMinorOrBlank(l.debitCents)}</td>
                  <td className="num">{fmtMinorOrBlank(l.creditCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ledger-grand-total">
                <th colSpan={foreign ? 4 : 2}>Total</th>
                <th className="num">{fmtMinor(totalDebit)}</th>
                <th className="num">{fmtMinor(totalCredit)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
