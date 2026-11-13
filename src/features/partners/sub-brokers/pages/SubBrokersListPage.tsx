import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { pct, useSubBrokerMeta, type SubBroker } from "../lib/subBrokers";

interface ListResponse {
  subBrokers: SubBroker[];
  total: number;
  page: number;
  pageSize: number;
}

const SORTS: [string, string][] = [
  ["name", "Name"], ["reference_no", "Reference"], ["status", "Status"], ["onboarded_on", "Onboarded"], ["state", "State"],
];

// Sub-broker register: filter by status / officer / state / type, sorted and
// paginated by the server (GET /api/sub-brokers).
export function SubBrokersListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { meta, can } = useSubBrokerMeta();
  const get = (k: string) => params.get(k) || "";
  const page = Number(get("page") || "1");
  const [qInput, setQInput] = useState(get("q"));

  const query = new URLSearchParams();
  for (const k of ["status", "type", "state", "officer", "q", "sort", "dir"]) if (get(k)) query.set(k, get(k));
  query.set("page", String(page));
  query.set("pageSize", "25");

  const { data, isLoading, error } = useQuery({
    queryKey: ["sub-brokers", "list", query.toString()],
    queryFn: () => api.get<ListResponse>(`/api/sub-brokers?${query.toString()}`),
  });
  const pending = useQuery({
    queryKey: ["sub-brokers", "pending-count"],
    queryFn: () => api.get<{ splits: unknown[] }>("/api/sub-brokers/splits/pending"),
    enabled: can("subbroker.approve-split"),
  });

  function update(next: Record<string, string>) {
    const merged: Record<string, string> = {};
    for (const k of ["status", "type", "state", "officer", "q", "sort", "dir"]) if (get(k)) merged[k] = get(k);
    Object.assign(merged, { page: "1" }, next);
    for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
    setParams(merged);
  }

  const columns: DataGridColumn<SubBroker>[] = [
    { key: "ref", header: "Reference", render: (s) => <Link to={`/sub-brokers/${s.id}`}>{s.reference_no}</Link> },
    { key: "name", header: "Name", render: (s) => (<>{s.name}<div className="exec-dl-note">{s.type}{s.contact_person ? ` · ${s.contact_person}` : ""}</div></>) },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
    { key: "split", header: "Default split", align: "right", render: (s) => pct(s.current_default_bps) },
    { key: "state", header: "State", render: (s) => s.state || "—" },
    { key: "officer", header: "Officer", render: (s) => s.relationship_officer || "—" },
    { key: "n", header: "Policies", align: "right", render: (s) => (s.n_transactions ?? 0).toLocaleString() },
    { key: "on", header: "Onboarded", render: (s) => s.onboarded_on || "—" },
  ];

  if (error) {
    return <div className="flash flash-error">{error instanceof Error ? error.message : "Could not load sub-brokers."}</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Policies &amp; Money</p>
          <h1>Sub-Brokers</h1>
        </div>
        <div className="page-header-actions">
          {can("subbroker.approve-split") && (
            <Link className="btn-secondary btn" to="/sub-brokers/approvals">
              Split approvals{pending.data?.splits.length ? ` (${pending.data.splits.length})` : ""}
            </Link>
          )}
          {can("subbroker.report") && (
            <>
              <Link className="btn-secondary btn" to="/sub-brokers/reports">Reports</Link>
              <a className="btn-secondary btn" href={apiUrl(`/api/sub-brokers/reports/register/excel?${query.toString()}`)}>Export register</a>
            </>
          )}
          {meta?.permissions.includes("subbroker.approve-split") && (
            <Link className="btn-secondary btn" to="/sub-brokers/settings">Settings</Link>
          )}
          {can("subbroker.create") && (
            <>
              <Link className="btn-secondary btn" to="/sub-brokers/import">Upload sub-brokers</Link>
              <button type="button" className="btn" onClick={() => navigate("/sub-brokers/new")}>+ New sub-broker</button>
            </>
          )}
        </div>
      </div>

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: qInput }); }} style={{ display: "flex", gap: "0.5rem" }}>
          <input type="search" placeholder="Search name, reference, email, phone…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <button type="submit" className="btn-secondary btn">Search</button>
        </form>
        <select aria-label="Status" value={get("status")} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>
          {(meta?.statuses ?? []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Type" value={get("type")} onChange={(e) => update({ type: e.target.value })}>
          <option value="">Individual &amp; corporate</option>
          {(meta?.types ?? []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="State" value={get("state")} onChange={(e) => update({ state: e.target.value })}>
          <option value="">All states</option>
          {(meta?.states ?? []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Relationship officer" value={get("officer")} onChange={(e) => update({ officer: e.target.value })}>
          <option value="">All officers</option>
          {(meta?.officers ?? []).map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
        </select>
        <select aria-label="Sort by" value={get("sort") || "name"} onChange={(e) => update({ sort: e.target.value })}>
          {SORTS.map(([v, label]) => <option key={v} value={v}>Sort: {label}</option>)}
        </select>
        <select aria-label="Direction" value={get("dir") || "asc"} onChange={(e) => update({ dir: e.target.value })}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.subBrokers}
        isLoading={isLoading}
        getRowKey={(s) => s.id}
        emptyMessage="No sub-brokers match these filters."
        paging={
          data
            ? {
                page: data.page,
                totalPages: Math.max(1, Math.ceil(data.total / data.pageSize)),
                total: data.total,
                onPageChange: (p) => update({ page: String(p) }),
              }
            : undefined
        }
      />
    </div>
  );
}
