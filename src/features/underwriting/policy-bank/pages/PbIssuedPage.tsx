import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { engine } from "../api/engine";
import { usePbAccess } from "../api/policyBank";
import { PbLayout, PbStatus } from "../components/PbCommon";

export function PbIssuedPage() {
  const { can } = usePbAccess();
  const [page, setPage] = useState(1);
  const allowed = can("policy_wording.view_history") || can("policy_wording.issue") || can("policy_wording.approve") || can("policy_wording.download");
  const list = useQuery({ queryKey: ["pb", "pe-issued", page], queryFn: () => engine.issued(`?page=${page}&perPage=20`), enabled: allowed });
  return (
    <PbLayout title="Issued policies" intro="Policies whose wording has been approved and frozen. Each keeps the exact wording it was issued with, whatever happens to the Policy Bank afterwards.">
      {!allowed && <div className="card empty-state">You need a history, approval or issue permission to see issued policies.</div>}
      {allowed && (
        <div className="card pb-table-wrap">
          <table>
            <thead><tr><th>Policy</th><th>Client</th><th>Wording</th><th>Status</th><th>Approved by</th><th>Issued</th><th>Documents</th><th /></tr></thead>
            <tbody>
              {list.isLoading && <tr><td colSpan={8}>Loading…</td></tr>}
              {list.data && list.data.rows.length === 0 && <tr><td colSpan={8} className="pb-muted">No policy has been issued through the Policy Bank yet.</td></tr>}
              {(list.data?.rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.policy_number}{r.kind === "amendment" ? <span className="pb-muted"> · amendment {r.amendment_no}</span> : r.kind === "renewal" ? <span className="pb-muted"> · renewal</span> : null}</td><td>{r.client}</td><td>v{r.wording_version_label}</td><td><PbStatus status={r.status} /></td><td>{r.approved_by}</td>
                  <td>{r.issued_at?.slice(0, 10)} <span className="pb-muted">by {r.issued_by}</span></td>
                  <td>{r.documents.length ? r.documents.map((d) => `${d.format.toUpperCase()} v${d.document_version}`).join(", ") : <span className="pb-muted">none</span>}</td>
                  <td><Link className="btn-secondary btn" to={`/policy-bank/builder/${r.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && list.data.totalPages > 1 && (
            <div className="pagination">
              <button type="button" className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button>
              <span className="pagination-status">Page {list.data.page} of {list.data.totalPages}</span>
              <button type="button" className="pagination-btn" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Older →</button>
            </div>
          )}
        </div>
      )}
    </PbLayout>
  );
}
