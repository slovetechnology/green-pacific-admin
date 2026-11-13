import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface Result {
  client: { id: number; name: string; industry_naics: string | null };
  gaps: { class_of_business: string; priority: string }[];
}

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export function CoverageGapsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "coverage-gaps"],
    queryFn: () => api.get<{ results: Result[] }>("/api/crm/coverage-gaps"),
  });

  const columns: DataGridColumn<Result>[] = [
    { key: "client", header: "Client", render: (r) => <Link to={`/clients/${r.client.id}`}>{r.client.name}</Link> },
    { key: "industry", header: "Industry", render: (r) => r.client.industry_naics },
    {
      key: "gaps",
      header: "Missing Coverage",
      render: (r) => (
        <>
          {r.gaps.map((g) => (
            <span key={g.class_of_business} className={`badge badge-${slug(g.priority)}`} style={{ marginRight: "0.4rem" }}>
              {g.class_of_business}
            </span>
          ))}
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Marketing Operations</p>
          <h1>Cross-Sell &amp; Coverage Gap Identification</h1>
          <p className="page-lede">Active clients whose held coverage doesn't match what's expected for their industry.</p>
        </div>
        <div className="page-header-actions">
          <Link className="btn-secondary btn" to="/crm/segments">Segmentation</Link>
          <Link className="btn-secondary btn" to="/crm/coverage-matrix">Manage coverage matrix</Link>
        </div>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.results}
        isLoading={isLoading}
        getRowKey={(r) => r.client.id}
        emptyMessage="No coverage gaps found — either every active client's book is fully aligned with the matrix, or no clients have an industry code assigned yet (set one on the client's Edit page)."
      />
    </div>
  );
}
