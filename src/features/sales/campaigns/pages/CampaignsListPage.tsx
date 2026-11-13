import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface Campaign {
  id: number;
  name: string;
  channel: string;
  status: string;
  n_recipients: number;
  n_opened: number;
  n_clicked: number;
  n_escalated: number;
  budget: number;
}

export function CampaignsListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<{ campaigns: Campaign[] }>("/api/campaigns"),
  });
  const search = useRowSearch(data?.campaigns, (c) => [c.name, c.channel, c.status]);

  const columns: DataGridColumn<Campaign>[] = [
    { key: "name", header: "Name", render: (c) => <Link to={`/campaigns/${c.id}`}>{c.name}</Link> },
    { key: "channel", header: "Channel", render: (c) => c.channel },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "recipients", header: "Recipients", align: "right", render: (c) => c.n_recipients },
    { key: "opened", header: "Opened", align: "right", render: (c) => c.n_opened },
    { key: "clicked", header: "Clicked", align: "right", render: (c) => c.n_clicked },
    { key: "escalated", header: "Escalated", align: "right", render: (c) => c.n_escalated },
    { key: "budget", header: "Budget", align: "right", render: (c) => fmtMoney(c.budget) },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Marketing Operations</p>
          <h1>Multi-Channel Campaigns</h1>
        </div>
        <RoleGate need="write">
          <button type="button" className="btn" onClick={() => navigate("/campaigns/new")}>+ New Campaign</button>
        </RoleGate>
      </div>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Campaign name, channel or status…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(c) => c.id}
        emptyMessage={
          <>
            No campaigns yet. Build one from the <Link to="/crm/segments">Segmentation</Link> page, or start from scratch.
          </>
        }
      />
    </div>
  );
}
