import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { PIPELINE, bpsText, minorText, useReinsuranceStatus } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

interface Row {
  id: number; placement_ref: string; subject_type: "Facultative" | "Treaty"; status: string; currency: string; order_bps: number; fac_ref: string | null; fac_type: string | null; treaty_ref: string | null; treaty_type: string | null; original_insured: string | null;
  class_of_business: string | null; sum_insured_minor: number | null; required_fac_minor: number | null; cedant_name: string; firm_bps: number; updated_at: string;
}

// Facultative placements, newest activity first (GET /api/reinsurance/placements).
export function PlacementsListPage() {
  const [params, setParams] = useSearchParams();
  const { can, isLoading: statusLoading, status } = useReinsuranceStatus();
  const [qInput, setQInput] = useState(params.get("q") || "");
  const page = Number(params.get("page") || "1");
  const query = new URLSearchParams();
  for (const k of ["status", "q"]) if (params.get(k)) query.set(k, params.get(k)!);
  query.set("limit", "25");
  query.set("offset", String((page - 1) * 25));

  const { data, isLoading, error } = useQuery({
    queryKey: ["ri", "placements", query.toString()],
    queryFn: () => api.get<{ rows: Row[]; total: number }>(`/api/reinsurance/placements?${query.toString()}`),
    enabled: can("ri.view"),
  });
  const update = (next: Record<string, string>) => {
    const merged: Record<string, string> = {};
    for (const k of ["status", "q"]) if (params.get(k)) merged[k] = params.get(k)!;
    Object.assign(merged, { page: "1" }, next);
    for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
    setParams(merged);
  };

  if (!statusLoading && !status?.enabled) return <div className="flash flash-info">The reinsurance module is switched off. An administrator can enable it under Reinsurance, Administration.</div>;
  if (!statusLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance. Ask an administrator for a reinsurance role.</div>;
  if (error) return <div className="flash flash-error">{error instanceof Error ? error.message : "Could not load placements."}</div>;

  const columns: DataGridColumn<Row>[] = [
    { key: "ref", header: "Placement", render: (r) => (<><Link to={`/reinsurance/placements/${r.id}`}>{r.placement_ref}</Link><div className="ri-note">{r.subject_type === "Treaty" ? `${r.treaty_ref} · ${r.treaty_type}` : `${r.fac_ref} · ${r.fac_type}`}</div></>) },
    { key: "risk", header: "Risk", render: (r) => (<>{r.original_insured || "—"}<div className="ri-note">{r.class_of_business || "—"}</div></>) },
    { key: "cedant", header: "Cedant", render: (r) => r.cedant_name },
    { key: "si", header: "Sum insured", align: "right", render: (r) => (r.sum_insured_minor == null ? "—" : minorText(r.sum_insured_minor, r.currency)) },
    { key: "fac", header: "Fac required", align: "right", render: (r) => (r.required_fac_minor == null ? "—" : minorText(r.required_fac_minor, r.currency)) },
    { key: "firm", header: "Firm / order", align: "right", render: (r) => `${bpsText(r.firm_bps)} / ${bpsText(r.order_bps)}` },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "upd", header: "Updated", render: (r) => r.updated_at?.slice(0, 10) },
  ];

  return (
    <div>
      <div className="page-header">
        <div><p className="eyebrow">Reinsurance</p><h1>Facultative placements</h1></div>
        <div className="page-header-actions">
          {can("ri.placement.edit") && <Link className="btn" to="/reinsurance/placements/new">+ New fac placement</Link>}
        </div>
      </div>
      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: qInput }); }} style={{ display: "flex", gap: "0.5rem" }}>
          <input type="search" placeholder="Search reference, insured, cedant, risk…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <button type="submit" className="btn-secondary btn">Search</button>
        </form>
        <select aria-label="Status" value={params.get("status") || ""} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>
          {[...PIPELINE, "Lapsed", "Declined"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <DataGrid
        columns={columns} rows={data?.rows} isLoading={isLoading || statusLoading} getRowKey={(r) => r.id}
        emptyMessage="No placements yet."
        paging={data ? { page, totalPages: Math.max(1, Math.ceil(data.total / 25)), total: data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
      />
    </div>
  );
}
