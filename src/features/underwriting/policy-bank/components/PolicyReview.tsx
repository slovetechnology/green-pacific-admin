import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { engine, type Draft, type DraftChanges, type Diff } from "../api/engine";
import { pb, usePbAccess, type ApprovalRow, type Paged } from "../api/policyBank";
import { Flash, PbStatus, ReasonButton, useAct } from "./PbCommon";
import { PolicyChanges } from "./PolicyChanges";
import { PolicyFollowOn } from "./PolicyFollowOn";
import { PolicyPreview } from "./PolicyPreview";
import { PolicyValidationPanel } from "./PolicyValidationPanel";
import { confirmDialog } from "@/shared/components/Dialogs";

const ACTION_LABEL: Record<string, string> = { submit: "Submitted for approval", approve: "Approved", reject: "Sent back / withdrawn", issue: "Issued" };

/**
 * A policy that is past the builder: waiting for approval, approved, issued, or otherwise closed. Approvers approve or
 * send it back, issuers issue it, and an issued policy shows its documents and the integrity of its record.
 */
export function PolicyReview({ draft }: { draft: Draft }) {
  const { user } = useAuth();
  const { can } = usePbAccess();
  const followOn = draft.kind === "amendment" || draft.kind === "renewal";
  const [tab, setTab] = useState<"validation" | "preview" | "changes" | "history">(draft.status === "Issued" ? (followOn ? "changes" : "history") : "validation");
  const [formats, setFormats] = useState<{ pdf: boolean; docx: boolean }>({ pdf: true, docx: false });
  const issued = draft.status === "Issued" || draft.status === "Superseded";
  const open = draft.status === "Submitted" || draft.status === "Approved";

  const review = useQuery({ queryKey: ["pb", "pe-review", draft.id, draft.status], queryFn: () => engine.reviewDraft(draft.id), enabled: open });
  const history = useQuery({ queryKey: ["pb", "pe-history", draft.id, draft.status], queryFn: () => pb.get<Paged<ApprovalRow>>(`/approvals?subjectType=issued_policy&subjectId=${draft.id}&perPage=100`) });
  const docs = useQuery({ queryKey: ["pb", "pe-docs", draft.id, draft.status], queryFn: () => engine.issuedDocuments(draft.id), enabled: issued });
  const snapshot = useQuery({ queryKey: ["pb", "pe-snapshot", draft.id], queryFn: () => engine.issuedSnapshot(draft.id), enabled: issued });
  const liveChanges = useQuery({ queryKey: ["pb", "pe-changes", draft.id, draft.status], queryFn: () => engine.draftChanges(draft.id), enabled: followOn && open });
  // An issued amendment or renewal shows the changes recorded in its snapshot.
  const lineage = (snapshot.data?.snapshot as { lineage?: { type: string; number?: number; effectiveDate?: string; reason?: string; parent: { id: number; policyNumber: string | null; issuedAt: string | null; sha256: string }; changes: Diff } } | undefined)?.lineage;
  const recorded: DraftChanges | undefined = lineage ? {
    kind: lineage.type as "amendment" | "renewal", amendmentNo: lineage.number ?? 0, effectiveDate: lineage.effectiveDate ?? null, reason: lineage.reason ?? null, renewal: null,
    parent: { id: lineage.parent.id, policyNumber: lineage.parent.policyNumber, status: "", issuedAt: lineage.parent.issuedAt, snapshotSha256: lineage.parent.sha256 },
    diff: lineage.changes, fingerprint: "", confirmation: { required: false, confirmed: true, by: null, at: null },
  } : undefined;
  const changes = open ? liveChanges.data : recorded;

  const approve = useAct(() => engine.approveDraft(draft.id), () => "Approved. It can now be issued.");
  const back = useAct((reason: string) => engine.returnDraft(draft.id, reason), () => "Sent back to the author.");
  const issue = useAct(() => engine.issueDraft(draft.id, (["pdf", "docx"] as const).filter((f) => formats[f])), (r) => r.documentError ?? `Issued. ${r.documents.length} document(s) filed.`);
  const generate = useAct((format: "pdf" | "docx") => engine.generateDocument(draft.id, format), (r) => `Generated ${r.document.format.toUpperCase()} version ${r.document.document_version}.`);

  const mine = user && (draft.created_by === user.username || draft.submitted_by === user.username);
  const validation = review.data?.validation;
  const reviewError = review.error ?? approve.error ?? back.error ?? issue.error ?? generate.error;

  return (
    <div>
      <div className="card">
        <div className="pb-row-actions" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>
              {draft.kind === "amendment" ? `Amendment ${draft.amendment_no} · ` : draft.kind === "renewal" ? "Renewal · " : ""}
              {draft.policy_no ?? draft.policy_number ?? `Policy record ${draft.id}`} · {draft.product_name} v{draft.product_version ?? draft.wording_version_label}
            </h3>
            <p className="pb-muted" style={{ margin: "0.3rem 0 0" }}>
              <PbStatus status={draft.status} />{" "}
              Started by {draft.created_by}
              {draft.submitted_by ? ` · submitted by ${draft.submitted_by}` : ""}
              {draft.approved_by ? ` · approved by ${draft.approved_by}${draft.approved_at ? ` on ${draft.approved_at.slice(0, 10)}` : ""}` : ""}
              {draft.issued_by ? ` · issued by ${draft.issued_by}${draft.issued_at ? ` on ${draft.issued_at.slice(0, 10)}` : ""}` : ""}
            </p>
          </div>
          <Link className="btn-secondary btn" to={`/transactions/${draft.transaction_id}?tab=wording`}>Transaction</Link>
        </div>
        <Flash error={reviewError} ok={approve.ok ?? back.ok ?? issue.ok ?? generate.ok} />

        {draft.status === "Submitted" && (
          <div className="pb-row-actions" style={{ marginTop: "0.8rem" }}>
            {can("policy_wording.approve") && (
              <>
                <button type="button" className="btn" disabled={approve.isPending || !!mine || (validation ? !validation.ready : true)} onClick={() => approve.mutate(undefined)}>{approve.isPending ? "Approving…" : "Approve"}</button>
                <ReasonButton label="Send back…" prompt="What should the author change?" onConfirm={(r) => back.mutate(r)} disabled={back.isPending} />
              </>
            )}
            {mine && can("policy_wording.approve") && <span className="pb-muted">You wrote or submitted this policy, so someone else must approve it.</span>}
            {!can("policy_wording.approve") && <span className="pb-muted">Waiting for an approver.</span>}
          </div>
        )}
        {draft.status === "Approved" && (
          <div style={{ marginTop: "0.8rem" }}>
            {can("policy_wording.issue") ? (
              <div className="pb-row-actions" style={{ alignItems: "center" }}>
                <label><input type="checkbox" checked={formats.pdf} onChange={(e) => setFormats({ ...formats, pdf: e.target.checked })} /> PDF</label>
                <label><input type="checkbox" checked={formats.docx} onChange={(e) => setFormats({ ...formats, docx: e.target.checked })} /> Word</label>
                <button type="button" className="btn" disabled={issue.isPending || (validation ? !validation.ready : true)} onClick={async () => { if (await confirmDialog("Issue this policy? The record is frozen and cannot be edited afterwards.")) issue.mutate(undefined); }}>{issue.isPending ? "Issuing…" : "Issue policy"}</button>
                {can("policy_wording.approve") && <ReasonButton label="Send back…" prompt="Why is the approval being withdrawn?" onConfirm={(r) => back.mutate(r)} disabled={back.isPending} />}
              </div>
            ) : <span className="pb-muted">Approved. Waiting for someone with the issue permission.</span>}
          </div>
        )}
        {can("policy_wording.generate") && open && (
          <p style={{ margin: "0.8rem 0 0" }}><Link to={`/policy-bank/builder/${draft.id}?edit=1`}>Edit this policy</Link> <span className="pb-muted">(it goes back to draft and needs approving again)</span></p>
        )}
      </div>

      {issued && (
        <div className="card pb-table-wrap">
          <h3 className="card-title">Policy documents</h3>
          {snapshot.data && (
            <p className={snapshot.data.intact ? "pb-muted" : "pb-warn"}>
              {snapshot.data.intact ? "The issued record is intact" : "The issued record no longer matches its hash"} <span className="pb-code">({snapshot.data.sha256.slice(0, 16)}…)</span>
            </p>
          )}
          <table>
            <thead><tr><th>Format</th><th>Version</th><th>Generated by</th><th>When</th><th /></tr></thead>
            <tbody>
              {(docs.data?.documents ?? []).length === 0 && <tr><td colSpan={5} className="pb-muted">No document yet.</td></tr>}
              {(docs.data?.documents ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.format === "pdf" ? "PDF" : "Word"}</td><td>v{d.document_version}</td><td>{d.generated_by}</td><td>{d.generated_at?.slice(0, 16).replace("T", " ")}</td>
                  <td>{can("policy_wording.download") && <a className="btn-secondary btn" href={engine.documentUrl(d.id)}>Download</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {can("policy_wording.issue") && draft.status === "Issued" && (
            <div className="pb-row-actions" style={{ marginTop: "0.8rem" }}>
              <button type="button" className="btn-secondary btn" disabled={generate.isPending} onClick={() => generate.mutate("pdf")}>Generate PDF again</button>
              <button type="button" className="btn-secondary btn" disabled={generate.isPending} onClick={() => generate.mutate("docx")}>Generate Word</button>
              <span className="pb-muted">Each is a new document version, made from the record taken at issue.</span>
            </div>
          )}
        </div>
      )}

      <div className="pb-tabs" role="tablist" style={{ marginTop: "1rem" }}>
        {([...(open ? ["validation", "preview"] : []), ...(followOn ? ["changes"] : []), "history"] as ("validation" | "preview" | "changes" | "history")[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`pb-tab${tab === t ? " active" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setTab(t)}>
            {t === "validation" ? "Validation" : t === "preview" ? "Preview" : t === "changes" ? (draft.kind === "renewal" ? "Changes from previous policy" : "Changes") : "History"}
          </button>
        ))}
      </div>
      {tab === "changes" && followOn && (changes
        ? <PolicyChanges changes={changes} canConfirm={false} onConfirm={() => undefined} confirming={false} />
        : <div className="card"><p className="pb-muted">Loading the changes…</p></div>)}
      {open && tab === "validation" && <PolicyValidationPanel validation={validation} isFetching={review.isFetching} />}
      {open && tab === "preview" && <PolicyPreview preview={review.data} isLoading={review.isLoading} productName={draft.product_name} />}
      {issued && <div style={{ marginTop: "1rem" }}><PolicyFollowOn draft={draft} /></div>}
      {(tab === "history" || (!open && !followOn)) && (
        <div className="card pb-table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Note</th></tr></thead>
            <tbody>
              {(history.data?.rows ?? []).length === 0 && <tr><td colSpan={4} className="pb-muted">No steps recorded yet.</td></tr>}
              {(history.data?.rows ?? []).map((h) => (
                <tr key={h.id}><td>{h.created_at?.slice(0, 16).replace("T", " ")}</td><td>{h.actor}</td><td>{ACTION_LABEL[h.action] ?? h.action}</td><td>{h.reason}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
