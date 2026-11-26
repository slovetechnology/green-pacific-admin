import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Notice } from "../components/Badges";
import { money } from "../components/Fields";
import { useHrAccess } from "../context/HrAccessContext";
import { useAction } from "../hooks/useHrApi";
import type { Reassignment } from "../lib/types";
import "../hr-admin.css";

// One transfer: what it moves, who asked and who decided, and the actions its status allows.
export function ReassignmentDetailPage() {
  const { reassignmentId } = useParams();
  const { user } = useAuth();
  const access = useHrAccess();
  const { run, notice, busy } = useAction();
  const [note, setNote] = useState("");
  const path = `/api/hr-admin/reassignments/${reassignmentId}`;
  const { data, isLoading } = useQuery({ queryKey: ["hr", "reassignment", reassignmentId], queryFn: () => api.get<{ reassignment: Reassignment }>(path) });
  if (isLoading || !data) return <div className="card">Loading…</div>;
  const r = data.reassignment;
  const isMaker = r.requested_by === user?.username;

  return (
    <div className="hr-page">
      <div className="page-header">
        <h1>{r.ref} <StatusBadge status={r.status} /></h1>
        <Link to="/hr/reassignments" className="btn-secondary btn">All reassignments</Link>
      </div>
      <Notice notice={notice} />
      <div className="card">
        <dl className="hr-dl">
          <dt>Move</dt><dd>{r.from_username} → {r.to_username}</dd>
          <dt>Reason</dt><dd>{r.reason_code}: {r.reason}{r.appraisal_id ? ` (appraisal #${r.appraisal_id})` : ""}</dd>
          <dt>Effective</dt><dd>{r.effective_date}</dd>
          <dt>Size</dt><dd>{r.client_count} clients · {r.policy_count} policies · {money(r.premium_total)}</dd>
          <dt>Requested</dt><dd>{r.requested_by}, {r.created_at?.slice(0, 10)}</dd>
          {r.approved_by && <><dt>Decided</dt><dd>{r.approved_by}{r.decision_note ? `: ${r.decision_note}` : ""}</dd></>}
          {r.executed_at && <><dt>Executed</dt><dd>{r.executed_at}</dd></>}
          {r.reversed_at && <><dt>Reversed</dt><dd>{r.reversed_at}: {r.reversal_reason}</dd></>}
        </dl>
      </div>

      {r.status === "Pending Approval" && access.decideReassignments && (
        <div className="card hr-form">
          <h2>Decision</h2>
          {isMaker ? (
            <p className="hr-hint">You requested this, so someone else has to approve it.</p>
          ) : (
            <>
              <TextArea label="Note (required to reject)" value={note} onChange={setNote} />
              <div className="form-actions">
                <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.post(`${path}/decision`, { decision: "approve", note }), "Approved.")}>Approve</button>
                <button type="button" className="btn-secondary btn" disabled={busy || !note.trim()} onClick={() => run(() => api.post(`${path}/decision`, { decision: "reject", note }), "Rejected.")}>Reject</button>
              </div>
            </>
          )}
        </div>
      )}
      {r.status === "Approved" && access.managePay && (
        <div className="card hr-form">
          <h2>Execute</h2>
          <p className="hr-hint">Moves every client and policy below in one step. If anything fails, nothing is moved.</p>
          <div className="form-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => window.confirm(`Move ${r.client_count} clients from ${r.from_username} to ${r.to_username}?`) && run(() => api.post(`${path}/execute`, {}), "Reassignment executed.")}>Execute reassignment</button>
          </div>
        </div>
      )}
      {r.status === "Executed" && access.managePay && (
        <div className="card hr-form">
          <h2>Reverse</h2>
          <p className="hr-hint">Puts back only what is still where this move left it; changes made since by anyone else are kept.</p>
          <TextArea label="Why is it being reversed?" value={note} onChange={setNote} />
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" disabled={busy || !note.trim()} onClick={() => run(() => api.post(`${path}/reverse`, { reason: note }), "Reassignment reversed.")}>Reverse</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Clients</h2>
        <div className="exec-table-wrap table-wrap">
          <table className="exec-table is-static hr-table">
            <thead><tr><th>Client</th><th className="num">In-force policies</th><th className="num">Premium</th></tr></thead>
            <tbody>
              {(r.clients ?? []).map((c) => <tr key={c.id}><td>{c.client_name}</td><td className="num">{c.policies}</td><td className="num">{money(c.premium)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="reassign-note">{label}</label>
      <textarea id="reassign-note" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
