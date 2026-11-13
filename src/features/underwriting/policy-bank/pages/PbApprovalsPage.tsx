import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { TYPE_LABEL, pb, qs, type ApprovalRow, type Paged, type PbComponent, type PbProduct, type Rule } from "../api/policyBank";
import { engine } from "../api/engine";
import { usePbAccess } from "../api/policyBank";
import { PbLayout, PbStatus } from "../components/PbCommon";

export function PbApprovalsPage() {
  const [page, setPage] = useState(1);
  const { can } = usePbAccess();
  const policies = useQuery({ queryKey: ["pb", "pe-drafts", "waiting"], queryFn: () => engine.drafts("?status=Submitted&perPage=50"), enabled: can("policy_wording.approve") });
  const approved = useQuery({ queryKey: ["pb", "pe-drafts", "approved"], queryFn: () => engine.drafts("?status=Approved&perPage=50"), enabled: can("policy_wording.approve") || can("policy_wording.issue") });
  const waiting = useQuery({
    queryKey: ["pb", "approvals-queue"],
    queryFn: async () => {
      const [sub, rev, products, rules] = await Promise.all([
        pb.get<Paged<PbComponent>>(`/components${qs({ approval: "Submitted", perPage: 100 })}`),
        pb.get<Paged<PbComponent>>(`/components${qs({ approval: "UnderReview", perPage: 100 })}`),
        pb.get<Paged<PbProduct>>(`/products${qs({ perPage: 200 })}`),
        pb.get<{ rules: Rule[] }>(`/rules${qs({ status: "Draft" })}`),
      ]);
      const pick = (c: PbComponent) => c.versions.filter((v) => v.approval_status === "Submitted" || v.approval_status === "UnderReview").map((v) => ({ c, v }));
      return {
        wordings: [...sub.rows, ...rev.rows.filter((r) => !sub.rows.some((s) => s.id === r.id))].flatMap(pick),
        productVersions: products.rows.flatMap((p) => p.versions.filter((v) => v.approval_status === "Submitted" || v.approval_status === "UnderReview").map((v) => ({ p, v }))),
        rules: rules.rules,
      };
    },
  });
  const history = useQuery({ queryKey: ["pb", "approval-history", page], queryFn: () => pb.get<Paged<ApprovalRow>>(`/approvals${qs({ page, perPage: 15 })}`) });
  const w = waiting.data;

  return (
    <PbLayout title="Approvals" intro="Everything waiting for a second person. You cannot approve what you wrote yourself.">
      {(can("policy_wording.approve") || can("policy_wording.issue")) && (
        <div className="card pb-table-wrap">
          <h2 className="card-title">Policies waiting for approval ({policies.data?.total ?? "…"}) and for issue ({approved.data?.total ?? "…"})</h2>
          <table>
            <thead><tr><th>Policy</th><th>Client</th><th>Product</th><th>Status</th><th>Submitted by</th><th /></tr></thead>
            <tbody>
              {policies.data && approved.data && policies.data.rows.length + approved.data.rows.length === 0 && <tr><td colSpan={6} className="pb-muted">No policy is waiting.</td></tr>}
              {[...(policies.data?.rows ?? []), ...(approved.data?.rows ?? [])].map((d) => (
                <tr key={d.id}>
                  <td>{d.policy_no ?? `Draft #${d.id}`}</td><td>{d.client}</td><td>{d.product_name} v{d.product_version}</td><td><PbStatus status={d.status} /></td><td>{d.submitted_by ?? d.created_by}</td>
                  <td><Link className="btn" to={`/policy-bank/builder/${d.id}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card pb-table-wrap">
        <h2 className="card-title">Wording versions waiting ({w?.wordings.length ?? "…"})</h2>
        <table>
          <thead><tr><th>Code</th><th>Wording</th><th>Type</th><th>Version</th><th>Status</th></tr></thead>
          <tbody>
            {w && w.wordings.length === 0 && <tr><td colSpan={5} className="pb-muted">Nothing is waiting.</td></tr>}
            {(w?.wordings ?? []).map(({ c, v }) => (
              <tr key={v.id}>
                <td className="pb-code">{c.code}</td>
                <td><Link to={`/policy-bank/wordings/component/${c.id}`}>{c.name}</Link></td>
                <td>{TYPE_LABEL[c.component_type]}</td>
                <td>v{v.version}</td>
                <td><PbStatus status={v.approval_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card pb-table-wrap">
        <h2 className="card-title">Product versions waiting ({w?.productVersions.length ?? "…"})</h2>
        <table>
          <thead><tr><th>Product</th><th>Version</th><th>Status</th></tr></thead>
          <tbody>
            {w && w.productVersions.length === 0 && <tr><td colSpan={3} className="pb-muted">Nothing is waiting.</td></tr>}
            {(w?.productVersions ?? []).map(({ p, v }) => (
              <tr key={v.id}><td><Link to={`/policy-bank/product-versions/${v.id}`}>{p.name}</Link></td><td>v{v.version}</td><td><PbStatus status={v.approval_status} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card pb-table-wrap">
        <h2 className="card-title">Rules waiting for activation ({w?.rules.length ?? "…"})</h2>
        <table>
          <thead><tr><th>Rule</th><th>Written by</th></tr></thead>
          <tbody>
            {w && w.rules.length === 0 && <tr><td colSpan={2} className="pb-muted">Nothing is waiting.</td></tr>}
            {(w?.rules ?? []).map((r) => <tr key={r.id}><td><Link to="/policy-bank/rules">{r.name}</Link> <span className="pb-code pb-muted">{r.code}</span></td><td>{r.created_by}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="card pb-table-wrap">
        <h2 className="card-title">Recent decisions</h2>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th></tr></thead>
          <tbody>
            {(history.data?.rows ?? []).map((r) => (
              <tr key={r.id}><td>{r.created_at?.slice(0, 16).replace("T", " ")}</td><td>{r.actor}</td><td>{r.action}</td><td>{r.subject_type.replace("_", " ")} #{r.subject_id}</td><td>{r.reason}</td></tr>
            ))}
          </tbody>
        </table>
        {history.data && history.data.totalPages > 1 && (
          <div className="pagination">
            <button type="button" className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button>
            <span className="pagination-status">Page {history.data.page} of {history.data.totalPages}</span>
            <button type="button" className="pagination-btn" disabled={page >= history.data.totalPages} onClick={() => setPage(page + 1)}>Older →</button>
          </div>
        )}
      </div>
    </PbLayout>
  );
}
