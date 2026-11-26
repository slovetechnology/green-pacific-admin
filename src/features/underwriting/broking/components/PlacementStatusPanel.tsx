import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/shared/components/exec/Modal";
import "@/shared/styles/pipeline.css";
import "./placementStatus.css";
import { moveSlipStatus, SLIP_REASON_STATUSES, type BrokingSlip } from "../api/brokingSlips";

// The slip's placement steps: the moves allowed from its current status (the server's SLIP_TRANSITIONS), each with
// the date it took effect and a reason where the slip falls through or goes back, and the dated history of every move.

const ORDER = ["Draft", "Under Review", "Approved", "Submitted", "Acknowledged", "Quoted", "Accepted", "Bound", "Placed", "Completed"];
const FALL_THROUGH = new Set(["Declined", "Cancelled", "Expired"]);

const LABEL: Record<string, string> = {
  "Under Review": "Send for review",
  Draft: "Send back to draft",
  Submitted: "Mark as submitted",
  Acknowledged: "Insurer acknowledged",
  Quoted: "Quote received",
  Accepted: "Client accepted",
  Bound: "Cover bound",
  Placed: "Placed",
  Completed: "Complete",
  Declined: "Declined by market",
  Cancelled: "Cancel slip",
  Expired: "Expired",
};

const DATE_LABEL: Record<string, string> = {
  Bound: "Date cover was bound",
  Placed: "Date placement was completed",
  Accepted: "Date the client accepted",
  Quoted: "Date the quote was received",
};

const today = () => new Date().toISOString().slice(0, 10);
// "10 Nov 2026" from "2026-11-10".
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function PlacementStatusPanel({ slip }: { slip: BrokingSlip }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const next = slip.nextStatuses ?? [];
  const history = slip.statusHistory ?? [];
  const position = ORDER.indexOf(slip.status);
  const visited = new Set<string>(["Draft", ...history.flatMap((h) => [h.from_status ?? "", h.to_status])]);

  const move = useMutation({
    mutationFn: () => moveSlipStatus(slip.id, { status: target!, reason: reason.trim() || undefined, effectiveDate }),
    onSuccess: () => {
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: ["brokingSlip", slip.id] });
    },
  });

  function open(status: string) {
    setTarget(status);
    setReason("");
    setEffectiveDate(today());
    move.reset();
  }

  const needsReason = target !== null && SLIP_REASON_STATUSES.includes(target);
  const forward = next.filter((s) => !FALL_THROUGH.has(s) && s !== "Draft");
  const other = next.filter((s) => FALL_THROUGH.has(s) || s === "Draft");

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h3 className="card-title">Placement status</h3>

      <ol className="placement-track" aria-label="Placement steps">
        {ORDER.map((s, i) => {
          // Ticked only if the slip actually went through that step (a slip may skip Under Review or Acknowledged).
          const state = FALL_THROUGH.has(slip.status) ? (visited.has(s) ? "is-done is-off" : "is-off")
            : i === position ? "is-current" : i < position && visited.has(s) ? "is-done" : i < position ? "is-skipped" : "";
          return <li key={s} className={state} aria-current={i === position ? "step" : undefined}>{s}</li>;
        })}
      </ol>
      {FALL_THROUGH.has(slip.status) && (
        <p className="text-muted" style={{ marginTop: 0 }}>This slip is <strong>{slip.status.toLowerCase()}</strong>.</p>
      )}

      {next.length === 0 ? (
        <p className="text-muted">No further steps: this slip is {slip.status.toLowerCase()}.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          {["Draft", "Under Review"].includes(slip.status) && (
            <span className="text-muted" style={{ fontSize: "0.85rem" }}>Approve the slip to send it to market.</span>
          )}
          {slip.status === "Approved" && (
            <span className="text-muted" style={{ fontSize: "0.85rem" }}>Logging a market submission marks it as submitted.</span>
          )}
          {forward.map((s) => (
            <button key={s} type="button" className="btn btn-sm" onClick={() => open(s)}>{LABEL[s] ?? s}</button>
          ))}
          {other.map((s) => (
            <button key={s} type="button" className={s === "Cancelled" ? "btn btn-sm btn-danger" : "btn btn-sm btn-secondary"} onClick={() => open(s)}>
              {LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="table-responsive" style={{ marginTop: "1rem" }}>
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Status</th><th>By</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.effective_date ? fmtDate(h.effective_date) : "—"}</td>
                  <td>{h.from_status ? `${h.from_status} → ` : ""}<strong>{h.to_status}</strong></td>
                  <td>{h.changed_by || "—"}</td>
                  <td>{h.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={target !== null}
        title={target ? `${LABEL[target] ?? target}: ${slip.slip_number}` : ""}
        onClose={() => setTarget(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)}>Cancel</button>
            <button
              type="button"
              className={target === "Cancelled" ? "btn btn-danger" : "btn"}
              disabled={move.isPending || (needsReason && !reason.trim())}
              onClick={() => move.mutate()}
            >
              {move.isPending ? "Saving…" : `Move to ${target}`}
            </button>
          </>
        }
      >
        {move.isError && <div className="flash flash-error">{(move.error as Error).message}</div>}
        <p style={{ marginTop: 0 }}>
          From <strong>{slip.status}</strong> to <strong>{target}</strong>.
        </p>
        <div className="field">
          <label htmlFor="slip_status_date">{(target && DATE_LABEL[target]) || "Date"}</label>
          <input id="slip_status_date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="slip_status_reason">{needsReason ? "Reason (required)" : "Note (optional)"}</label>
          <textarea id="slip_status_reason" rows={3} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)}
            placeholder={target === "Declined" ? "e.g. Outside the insurer's appetite" : target === "Cancelled" ? "e.g. Client chose another broker" : ""} />
        </div>
      </Modal>
    </div>
  );
}
