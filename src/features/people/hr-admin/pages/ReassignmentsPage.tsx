import { useMemo } from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { money } from "../components/Fields";
import { ServerTable } from "../components/ServerTable";
import { useHrAccess } from "../context/HrAccessContext";
import { useServerTable } from "../hooks/useServerTable";
import type { Reassignment } from "../lib/types";
import "../hr-admin.css";

// Every book-of-business transfer, newest first, with where it stands in the approval.
export function ReassignmentsPage() {
  const access = useHrAccess();
  const table = useServerTable<Reassignment>("/api/hr-admin/reassignments", {}, [{ id: "created", desc: true }]);
  const meta = useQuery({ queryKey: ["hr", "reassign-meta"], queryFn: () => api.get<{ statuses: string[] }>("/api/hr-admin/reassignments/meta"), staleTime: 60_000 });

  const columns = useMemo<ColumnDef<Reassignment, unknown>[]>(
    () => [
      { id: "ref", header: "Ref", cell: ({ row }) => <Link to={`/hr/reassignments/${row.original.id}`}>{row.original.ref}</Link> },
      { id: "move", header: "From → to", enableSorting: false, cell: ({ row }) => `${row.original.from_username} → ${row.original.to_username}` },
      { id: "reason", header: "Reason", enableSorting: false, cell: ({ row }) => row.original.reason_code },
      { id: "clients", header: "Clients", meta: { num: true }, cell: ({ row }) => row.original.client_count },
      { id: "policies", header: "Policies", enableSorting: false, meta: { num: true }, cell: ({ row }) => row.original.policy_count },
      { id: "premium", header: "Premium", enableSorting: false, meta: { num: true }, cell: ({ row }) => money(row.original.premium_total) },
      { id: "effective", header: "Effective", cell: ({ row }) => row.original.effective_date },
      { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: "created", header: "Requested", cell: ({ row }) => <>{row.original.created_at?.slice(0, 10)} <small>{row.original.requested_by}</small></> },
    ],
    []
  );

  return (
    <div className="hr-page">
      <div className="page-header">
        <h1>Book of business reassignment</h1>
        {access.managePay && <Link to="/hr/reassignments/new" className="btn">New reassignment</Link>}
      </div>
      <p className="hr-hint">
        Moves a person's clients, and the producer name on their in-force policies, to someone else. Another person (the MD or an admin) must approve it, and it can be reversed.
      </p>
      <ServerTable
        table={table}
        columns={columns}
        getRowKey={(r) => r.id}
        emptyMessage="No reassignments yet."
        toolbar={
          <select aria-label="Status" value={table.filters.status ?? ""} onChange={(e) => table.setFilter("status", e.target.value)}>
            <option value="">Any status</option>
            {(meta.data?.statuses ?? []).map((s) => <option key={s}>{s}</option>)}
          </select>
        }
      />
    </div>
  );
}
