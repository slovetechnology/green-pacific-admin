import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { TYPE_LABEL, pb, qs, type Paged, type PbComponent } from "../api/policyBank";
import { PbLayout, PbStatus } from "../components/PbCommon";
import { useInsurerOptions } from "./PbWordingDetailPage";

export function PbInsurerWordingsPage() {
  const insurers = useInsurerOptions();
  const [params, setParams] = useSearchParams();
  const insurerId = params.get("insurerId") ?? "";
  const setInsurerId = (v: string) => setParams(v ? { insurerId: v } : {});
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["pb", "insurer-wordings", insurerId, page],
    queryFn: () => pb.get<Paged<PbComponent>>(`/components${qs({ insurerId, page, perPage: 25 })}`),
    enabled: !!insurerId,
  });

  return (
    <PbLayout
      title="Insurer-specific wordings"
      intro="Where an insurer has its own or approved wording for a component, it is held as a version for that insurer. Which source wins is set under Settings."
    >
      <div className="toolbar">
        <select value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setPage(1); }}>
          <option value="">Choose an insurer…</option>
          {(insurers.data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      {!insurerId && <div className="card empty-state">Choose an insurer to see the wordings held for it. To add one, open a wording and create a new version for that insurer.</div>}
      {insurerId && (
        <div className="card pb-table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Wording</th><th>Type</th><th>Insurer versions</th></tr></thead>
            <tbody>
              {list.isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
              {!list.isLoading && list.data?.rows.length === 0 && <tr><td colSpan={4} className="pb-muted">No wording is held for this insurer yet.</td></tr>}
              {(list.data?.rows ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="pb-code">{c.code}</td>
                  <td><Link to={`/policy-bank/wordings/component/${c.id}`}>{c.name}</Link></td>
                  <td>{TYPE_LABEL[c.component_type]}</td>
                  <td>
                    {c.versions.filter((v) => v.insurer_id === Number(insurerId)).map((v) => (
                      <span key={v.id} style={{ marginRight: "0.6rem" }}>v{v.version} <PbStatus status={v.approval_status} /> <span className="pb-muted">{v.source === "insurer_approved" ? "approved by insurer" : "insurer's own"}</span></span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && list.data.totalPages > 1 && (
            <div className="pagination">
              <button type="button" className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
              <span className="pagination-status">Page {list.data.page} of {list.data.totalPages}</span>
              <button type="button" className="pagination-btn" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}
    </PbLayout>
  );
}
