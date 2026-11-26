import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, qs, usePbAccess, type AuditRow, type Paged } from "../api/policyBank";
import { Flash, PbLayout } from "../components/PbCommon";

const ENTITIES = ["", "PolicyBankComponent", "PolicyBankComponentVersion", "PolicyBankProduct", "PolicyBankProductVersion", "PolicyBankClass", "PolicyBankRule", "PolicyBankVariable", "PolicyBankDependency", "PolicyBankConflict", "PolicyBankSetting", "PolicyBankRoles"];

export function PbAuditPage() {
  const { can } = usePbAccess();
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");
  const [entityId, setEntityId] = useState("");
  const [page, setPage] = useState(1);
  const allowed = can("policy_wording.view_history");
  const list = useQuery({
    queryKey: ["pb", "audit", entityType, actor, entityId, page],
    queryFn: () => pb.get<Paged<AuditRow>>(`/audit${qs({ entityType, actor, entityId, page, perPage: 30 })}`),
    enabled: allowed,
  });
  return (
    <PbLayout title="Audit history" intro="Who created, changed, submitted, approved, rejected or deactivated what, and when. Entries are written once and cannot be edited or deleted.">
      {!allowed && <div className="card empty-state">You need the history permission to read the audit trail.</div>}
      {allowed && (
        <>
          <Flash error={list.error} />
          <div className="toolbar">
            <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>{ENTITIES.map((x) => <option key={x} value={x}>{x ? x.replace("PolicyBank", "") : "Everything"}</option>)}</select>
            <input type="search" placeholder="Record id" value={entityId} onChange={(e) => { setEntityId(e.target.value.replace(/\D/g, "")); setPage(1); }} style={{ width: "7rem" }} />
            <input type="search" placeholder="Username" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} />
          </div>
          <div className="card pb-table-wrap">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What happened</th><th>Changes</th></tr></thead>
              <tbody>
                {list.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
                {!list.isLoading && list.data?.rows.length === 0 && <tr><td colSpan={6} className="pb-muted">Nothing recorded for this filter.</td></tr>}
                {(list.data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.created_at?.slice(0, 16).replace("T", " ")}</td>
                    <td>{r.actor}</td>
                    <td>{r.action}</td>
                    <td className="pb-code">{r.entity_type.replace("PolicyBank", "")} #{r.entity_id}</td>
                    <td>{r.summary}</td>
                    <td className="pb-code">
                      {r.changes ? Object.entries(r.changes).slice(0, 4).map(([k, v]) => {
                        const c = v as { from?: unknown; to?: unknown };
                        return <div key={k}>{k}: {c && typeof c === "object" && ("from" in c || "to" in c) ? `${String(c.from ?? "—")} → ${String(c.to ?? "—")}` : JSON.stringify(v)}</div>;
                      }) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data && list.data.totalPages > 1 && (
              <div className="pagination">
                <button type="button" className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button>
                <span className="pagination-status">Page {list.data.page} of {list.data.totalPages} ({list.data.total} entries)</span>
                <button type="button" className="pagination-btn" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Older →</button>
              </div>
            )}
          </div>
        </>
      )}
    </PbLayout>
  );
}
