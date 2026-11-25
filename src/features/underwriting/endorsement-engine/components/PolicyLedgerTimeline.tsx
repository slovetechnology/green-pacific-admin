import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { engine, fmtKobo, humanize, type TimelineEvent } from "../api";

// Chronological audit trail of a policy: placement slip -> credit / debit notes -> endorsements -> RP debit /
// credit notes -> receipts, remittances, insurer refunds -> client credit and refund vouchers (bank settlement).
const TONE: Record<string, string> = {
  POSTED: "is-info", SETTLED: "is-ok", PAID: "is-ok", RECONCILED: "is-ok", Remitted: "is-ok", REVERSED: "is-crit", REJECTED: "is-crit",
  PENDING_APPROVAL: "is-warn", PENDING_INSURER_REFUND: "is-warn", Unremitted: "is-warn", APPROVED: "is-info", PARTIALLY_SETTLED: "is-warn",
  Cancelled: "is-crit", CANCELLED: "is-crit", PREFUNDED: "is-info",
};

function Event({ e }: { e: TimelineEvent }) {
  return (
    <li className={`k-${e.kind}`}>
      <div className="ee-t-head">
        <span className="ee-t-date">{e.at || "—"}</span>
        <strong>{e.title}</strong>
        {e.reference && (e.link ? <Link to={e.link}>{e.reference}</Link> : <span>{e.reference}</span>)}
        {e.status && <span className={`ee-chip ${TONE[e.status] || ""}`}>{humanize(e.status)}</span>}
        {e.remittanceStatus && e.kind === "note" && e.party === "INSURER" && <span className="ee-chip">{e.remittanceStatus}</span>}
        {e.amountCents !== undefined && <span className="ee-t-amount">{fmtKobo(e.amountCents)}</span>}
      </div>
      {(e.parentRef || e.detail || e.journal || e.by) && (
        <div className="ee-t-detail">
          {e.parentRef && <>Amends {e.parentRef}. </>}
          {e.detail}
          {e.by && <> · by {e.by}{e.approvedBy && e.approvedBy !== e.by ? `, approved by ${e.approvedBy}` : ""}</>}
          {e.journal && <> · GL {e.journal}</>}
        </div>
      )}
    </li>
  );
}

export function PolicyLedgerTimeline({ txId }: { txId: number }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["engine", "timeline", txId], queryFn: () => engine.timeline(txId) });
  return (
    <div className="card">
      <h2>Policy ledger timeline</h2>
      {isLoading ? <p>Loading…</p> : error ? <p>Could not load the timeline.</p> : !data?.events.length ? <p>Nothing recorded yet.</p> : (
        <ol className="ee-timeline">{data.events.map((e, i) => <Event key={`${e.kind}-${e.reference}-${i}`} e={e} />)}</ol>
      )}
    </div>
  );
}
