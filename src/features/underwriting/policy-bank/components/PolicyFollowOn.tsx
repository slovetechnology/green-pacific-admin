import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { engine, type Draft } from "../api/engine";
import { usePbAccess } from "../api/policyBank";
import { Field, Flash, PbStatus, useAct } from "./PbCommon";

const KIND = (c: { kind: string; amendment_no: number }) => (c.kind === "amendment" ? `Amendment ${c.amendment_no}` : c.kind === "renewal" ? "Renewal" : "Original");

/**
 * An issued policy's family (original, amendments, renewals), and the way to amend or renew it. Only the current issued
 * policy can be amended or renewed; an amendment replaces it when issued, a renewal sits beside it.
 */
export function PolicyFollowOn({ draft }: { draft: Draft }) {
  const { can } = usePbAccess();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"amend" | "renew" | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [tx, setTx] = useState("");
  const chain = useQuery({ queryKey: ["pb", "pe-chain", draft.id, draft.status], queryFn: () => engine.chain(draft.id) });
  const candidates = useQuery({ queryKey: ["pb", "pe-renewal-candidates", draft.id], queryFn: () => engine.renewalCandidates(draft.id), enabled: mode === "renew" });
  const current = draft.status === "Issued";
  const mayAct = can("policy_wording.amend") && current;

  const amend = useAct(() => engine.amend(draft.id, { effectiveDate: date, reason }), (r) => { void navigate(`/policy-bank/builder/${r.draft.id}`); return "Amendment started."; });
  const renew = useAct(() => engine.renew(draft.id, Number(tx)), (r) => { void navigate(`/policy-bank/builder/${r.draft.id}`); return "Renewal started."; });

  return (
    <div className="card pb-table-wrap">
      <h3 className="card-title">Amendments and renewals</h3>
      <table>
        <thead><tr><th>Record</th><th>Status</th><th>Effective</th><th>Issued</th><th>Documents</th><th /></tr></thead>
        <tbody>
          {(chain.data?.chain ?? []).map((c) => (
            <tr key={c.id} style={c.current ? { fontWeight: 600 } : undefined}>
              <td>{KIND(c)} <span className="pb-muted">{c.policy_number}</span>{c.reason && <div className="pb-muted" style={{ fontWeight: 400, fontSize: "0.78rem" }}>{c.reason}</div>}</td>
              <td><PbStatus status={c.status} /></td>
              <td>{c.effective_date ?? "—"}</td>
              <td>{c.issued_at?.slice(0, 10) ?? "—"}</td>
              <td>{c.documents.map((d) => `${d.format.toUpperCase()} v${d.document_version}`).join(", ") || "—"}</td>
              <td>{!c.current && <Link className="btn-secondary btn" to={`/policy-bank/builder/${c.id}`}>Open</Link>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!current && can("policy_wording.amend") && <p className="pb-muted">Only the current issued policy can be amended or renewed. This one is {draft.status.toLowerCase()}.</p>}
      {mayAct && !mode && (
        <div className="pb-row-actions" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="btn" onClick={() => setMode("amend")}>Amend this policy</button>
          <button type="button" className="btn-secondary btn" onClick={() => setMode("renew")}>Renew this policy</button>
        </div>
      )}
      <Flash error={amend.error ?? renew.error} ok={amend.ok ?? renew.ok} />
      {mode === "amend" && (
        <form className="card" style={{ marginTop: "0.8rem" }} onSubmit={(e) => { e.preventDefault(); amend.mutate(undefined); }}>
          <h4 style={{ marginTop: 0 }}>Amend policy {draft.policy_number}</h4>
          <p className="pb-muted">The amendment starts from the policy as issued. The original is never edited: when the amendment is issued, it replaces the original from its effective date and the original is kept.</p>
          <div className="form-grid">
            <Field label="Effective date" hint="Within the policy period."><input type="date" className="form-control" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Reason"><input className="form-control" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Insured asked for flood cover" /></Field>
          </div>
          <div className="form-actions"><button type="submit" className="btn" disabled={amend.isPending}>Start amendment</button><button type="button" className="btn-secondary btn" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      {mode === "renew" && (
        <form className="card" style={{ marginTop: "0.8rem" }} onSubmit={(e) => { e.preventDefault(); renew.mutate(undefined); }}>
          <h4 style={{ marginTop: 0 }}>Renew policy {draft.policy_number}</h4>
          <p className="pb-muted">Record the renewal as a transaction first. The renewal starts on the latest approved wording with your previous choices carried over, and shows the changes for you to confirm.</p>
          <Field label="Renewal transaction">
            <select className="form-control" required value={tx} onChange={(e) => setTx(e.target.value)}>
              <option value="">Choose…</option>
              {(candidates.data?.candidates ?? []).map((c) => <option key={c.id} value={c.id} disabled={c.in_use}>{c.policy_no ?? `#${c.id}`}: {c.start_date} to {c.end_date}{c.likely ? " (renewal)" : ""}{c.in_use ? " (already has a policy)" : ""}</option>)}
            </select>
          </Field>
          {candidates.data && candidates.data.candidates.length === 0 && <p className="pb-muted">There is no later transaction for this client yet. Record the renewal in Transactions first.</p>}
          <div className="form-actions"><button type="submit" className="btn" disabled={renew.isPending || !tx}>Start renewal</button><button type="button" className="btn-secondary btn" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}
