import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface Activity {
  id: number;
  created_at: string;
  client_id: number;
  client_name: string;
  deal_id: number | null;
  deal_name: string | null;
  activity_type: string;
  producer_name: string | null;
  subject: string | null;
  notes: string | null;
  recording_file_path: string | null;
}

interface Response {
  activities: Activity[];
  activityTypes: string[];
  producers: { id: number; name: string }[];
}

export function CrmAuditTrailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activityType = searchParams.get("activity_type") || "";
  const producerId = searchParams.get("producer_id") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "audit-trail", activityType, producerId],
    queryFn: () => api.get<Response>(`/api/crm/audit-trail?activity_type=${encodeURIComponent(activityType)}&producer_id=${encodeURIComponent(producerId)}`),
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Activity>[] = [
    { key: "date", header: "Date", render: (a) => (a.created_at || "").slice(0, 10) },
    { key: "client", header: "Client", render: (a) => <Link to={`/clients/${a.client_id}`}>{a.client_name}</Link> },
    { key: "deal", header: "Deal", render: (a) => (a.deal_name ? <Link to={`/deals/${a.deal_id}`}>{a.deal_name}</Link> : "—") },
    { key: "type", header: "Type", render: (a) => <StatusBadge status={a.activity_type} /> },
    { key: "producer", header: "Producer", render: (a) => a.producer_name || "—" },
    { key: "subject", header: "Subject / Notes", render: (a) => `${a.subject || ""}${a.subject && a.notes ? " — " : ""}${a.notes || ""}` },
    {
      key: "recording",
      header: "",
      render: (a) =>
        a.recording_file_path && (
          <a className="btn-secondary btn-sm" href={apiUrl(`/api/deals/activities/${a.id}/recording`)}>Recording</a>
        ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>E&amp;O Audit Trail</h1>
          <p className="page-lede">Every logged communication and note, in one append-only record — nothing here can be edited or deleted from the app.</p>
        </div>
      </div>

      <div className="toolbar">
        <select value={activityType} onChange={(e) => updateParam("activity_type", e.target.value)}>
          <option value="">All types</option>
          {data?.activityTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={producerId} onChange={(e) => updateParam("producer_id", e.target.value)}>
          <option value="">All producers</option>
          {data?.producers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.activities}
        isLoading={isLoading}
        getRowKey={(a) => a.id}
        emptyMessage="No activity logged yet."
      />
    </div>
  );
}
