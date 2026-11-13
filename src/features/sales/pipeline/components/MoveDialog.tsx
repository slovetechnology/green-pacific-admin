import { useState, type FormEvent } from "react";
import { api } from "@/shared/api/client";
import { Modal } from "@/shared/components/exec/Modal";
import { GateNotice } from "./GateNotice";
import { describeError, missingOf, type GateItem, type MoveKind, type Stage } from "../lib/types";

export interface MoveRequest {
  deal: { id: number; deal_name: string; stage: string };
  to: Stage;
  kind: MoveKind;
}

// The moves that need something from the user: a reason for going back or
// reopening, or a reason code (and note) for losing the deal.
export function MoveDialog({
  request,
  lossReasons,
  onClose,
  onDone,
}: {
  request: MoveRequest | null;
  lossReasons: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Modal open={request !== null} title={request ? titleFor(request) : ""} onClose={onClose}>
      {request && <MoveForm request={request} lossReasons={lossReasons} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function titleFor(r: MoveRequest): string {
  if (r.kind === "lost") return "Mark as lost";
  if (r.kind === "reopen") return "Reopen this deal";
  return `Move back to ${r.to}`;
}

function MoveForm({ request, lossReasons, onClose, onDone }: { request: MoveRequest; lossReasons: string[]; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; missing: GateItem[] } | null>(null);
  const lost = request.kind === "lost";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/deals/${request.deal.id}/transition`, lost
        ? { to_stage: request.to, lost_reason_code: code, note }
        : { to_stage: request.to, reason });
      onDone();
    } catch (err) {
      setError({ message: describeError(err), missing: missingOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="pl-form">
      <p style={{ margin: 0 }}>
        <b>{request.deal.deal_name}</b>: {request.deal.stage} → {request.to}
      </p>
      {lost ? (
        <>
          <div className="field">
            <label htmlFor="mv-code">Why was it lost?</label>
            <select id="mv-code" value={code} onChange={(e) => setCode(e.target.value)} required>
              <option value="">Choose a reason…</option>
              {lossReasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mv-note">Note{code === "Other" ? " (required)" : " (optional)"}</label>
            <textarea id="mv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} required={code === "Other"} />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="mv-reason">Reason</label>
          <textarea id="mv-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="What changed?" />
          {request.kind === "back" && <p className="pl-hint">Moving back is recorded in the deal's history with this reason.</p>}
        </div>
      )}
      {error && <GateNotice message={error.message} items={error.missing.filter((m) => m.code !== "reason")} tone="crit" />}
      <div className="pl-modal-foot">
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className={lost ? "btn btn-danger btn-sm" : "btn btn-sm"} disabled={busy}>
          {busy ? "Saving…" : lost ? "Mark as lost" : "Move deal"}
        </button>
      </div>
    </form>
  );
}
