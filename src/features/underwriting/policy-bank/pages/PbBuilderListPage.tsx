import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { engine } from "../api/engine";
import { Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";
import { usePbAccess } from "../api/policyBank";

export function PbBuilderListPage() {
  const { can } = usePbAccess();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const canBuild = can("policy_wording.generate");

  const found = useQuery({ queryKey: ["pb", "pe-tx-search", q], queryFn: () => engine.transactions(q), enabled: canBuild && q.trim().length >= 2, placeholderData: keepPreviousData });
  const drafts = useQuery({ queryKey: ["pb", "pe-drafts", status, page], queryFn: () => engine.drafts(`?perPage=15&page=${page}${status ? `&status=${status}` : ""}`), enabled: canBuild });
  const del = useAct((id: number) => engine.deleteDraft(id), () => "Draft deleted.");

  return (
    <PbLayout title="Policy builder" intro="Build the policy wording for an existing transaction. The client, insurer and risk come from the transaction; you choose the product and the cover.">
      {!canBuild && <div className="card empty-state">You need the generate permission to build policies.</div>}
      {canBuild && (
        <>
          <div className="card">
            <h2 className="card-title">Start from a transaction</h2>
            <input type="search" placeholder="Search by policy number, client or insurer…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: "24rem" }} />
            {q.trim().length >= 2 && (
              <div className="pb-table-wrap" style={{ marginTop: "0.8rem" }}>
                <table>
                  <thead><tr><th>Policy</th><th>Client</th><th>Insurer</th><th>Class</th><th>Period</th><th /></tr></thead>
                  <tbody>
                    {found.isLoading && <tr><td colSpan={6}>Searching…</td></tr>}
                    {found.data && found.data.transactions.length === 0 && <tr><td colSpan={6} className="pb-muted">No transaction matches.</td></tr>}
                    {(found.data?.transactions ?? []).map((t) => (
                      <tr key={t.id}>
                        <td>{t.policy_no ?? `#${t.id}`}{t.parent_transaction_id ? <span className="pb-muted"> (endorsement note)</span> : null}</td>
                        <td>{t.client_name}</td>
                        <td>{t.insurer_name}</td>
                        <td>{t.class_of_business}</td>
                        <td>{t.start_date} to {t.end_date}</td>
                        <td>{!t.parent_transaction_id && <Link className="btn" to={`/policy-bank/builder/new?transactionId=${t.id}`}>Build wording</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Flash error={del.error} ok={del.ok} />
          <div className="toolbar">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All drafts</option><option>Draft</option><option>Submitted</option><option>Approved</option><option>Issued</option>
            </select>
          </div>
          <div className="card pb-table-wrap">
            <h2 className="card-title">Policies in progress</h2>
            <table>
              <thead><tr><th>Policy</th><th>Client</th><th>Product</th><th>Status</th><th>Started by</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {drafts.isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
                {drafts.data && drafts.data.rows.length === 0 && <tr><td colSpan={7} className="pb-muted">Nothing in progress. Search for a transaction above to start.</td></tr>}
                {(drafts.data?.rows ?? []).map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`/policy-bank/builder/${d.id}`}>{d.policy_no ?? `Draft #${d.id}`}</Link></td>
                    <td>{d.client}</td>
                    <td>{d.kind === "amendment" ? "Amendment · " : d.kind === "renewal" ? "Renewal · " : ""}{d.product_name} v{d.product_version}</td>
                    <td><PbStatus status={d.status} /></td>
                    <td>{d.created_by}</td>
                    <td>{d.updated_at?.slice(0, 16).replace("T", " ")}</td>
                    <td>
                      <div className="pb-row-actions">
                        <Link className="btn-secondary btn" to={`/policy-bank/builder/${d.id}`}>Open</Link>
                        {d.status === "Draft" && <button type="button" className="btn-secondary btn" disabled={del.isPending} onClick={() => { if (window.confirm("Delete this draft?")) del.mutate(d.id); }}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {drafts.data && drafts.data.totalPages > 1 && (
              <div className="pagination">
                <button type="button" className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
                <span className="pagination-status">Page {drafts.data.page} of {drafts.data.totalPages}</span>
                <button type="button" className="pagination-btn" disabled={page >= drafts.data.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}
    </PbLayout>
  );
}
