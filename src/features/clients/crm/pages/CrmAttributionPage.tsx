import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtPct } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface BySource {
  source: string;
  n_bound: number;
  total_commission: number;
}
interface ByCampaign {
  id: number;
  name: string;
  budget: number;
  n_bound: number;
  total_commission: number;
  roi_pct: number | null;
}
interface ByClass {
  class_of_business: string;
  n_bound: number;
  total_commission: number;
  avg_commission: number;
}

interface Response {
  bySource: BySource[];
  byCampaign: ByCampaign[];
  byClass: ByClass[];
}

export function CrmAttributionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "attribution"],
    queryFn: () => api.get<Response>("/api/crm/attribution"),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return null;

  const sourceColumns: DataGridColumn<BySource>[] = [
    { key: "source", header: "Source", render: (r) => r.source },
    { key: "n_bound", header: "Deals Bound", align: "right", render: (r) => r.n_bound },
    { key: "commission", header: "Commission Earned", align: "right", render: (r) => fmtMoney(r.total_commission) },
  ];

  const campaignColumns: DataGridColumn<ByCampaign>[] = [
    { key: "campaign", header: "Campaign", render: (r) => <Link to={`/campaigns/${r.id}`}>{r.name}</Link> },
    { key: "budget", header: "Budget", align: "right", render: (r) => fmtMoney(r.budget) },
    { key: "n_bound", header: "Deals Bound", align: "right", render: (r) => r.n_bound },
    { key: "commission", header: "Commission Earned", align: "right", render: (r) => fmtMoney(r.total_commission) },
    { key: "roi", header: "ROI", align: "right", render: (r) => (r.roi_pct === null ? "—" : fmtPct(r.roi_pct)) },
  ];

  const classColumns: DataGridColumn<ByClass>[] = [
    { key: "class", header: "Class", render: (r) => r.class_of_business },
    { key: "n_bound", header: "Deals Bound", align: "right", render: (r) => r.n_bound },
    { key: "commission", header: "Total Commission", align: "right", render: (r) => fmtMoney(r.total_commission) },
    { key: "avg_commission", header: "Avg Commission / Deal", align: "right", render: (r) => fmtMoney(r.avg_commission) },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Marketing Operations</p>
          <h1>Attribution &amp; Campaign ROI</h1>
          <p className="page-lede">Bound commission traced back to its originating lead source and campaign.</p>
        </div>
      </div>

      <div className="card">
        <h2>By Lead Source</h2>
      </div>
      <DataGrid
        columns={sourceColumns}
        rows={data.bySource}
        isLoading={false}
        getRowKey={(r) => r.source}
        emptyMessage="No bound deals with a lead source recorded yet."
      />

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>By Campaign</h2>
      </div>
      <DataGrid
        columns={campaignColumns}
        rows={data.byCampaign}
        isLoading={false}
        getRowKey={(r) => r.id}
        emptyMessage="No campaigns tied to bound deals yet."
      />

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>By Class of Business — LTV</h2>
      </div>
      <DataGrid
        columns={classColumns}
        rows={data.byClass}
        isLoading={false}
        getRowKey={(r) => r.class_of_business}
        emptyMessage="No bound deals with a class of business recorded yet."
      />
    </div>
  );
}
