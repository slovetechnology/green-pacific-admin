import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import "@/shared/styles/executive.css";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface QuoteRequestRow {
  id: number;
  client_name: string;
  request_type: string;
  source: string;
  reference: string | null;
  insurer_name: string | null;
  class_of_business: string | null;
  sum_insured_estimate: number;
  status: string;
  created_at: string;
}

interface Response {
  requests: QuoteRequestRow[];
  status: string;
  statuses: string[];
}

export function QuoteRequestsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["quote-requests", status],
    queryFn: () => api.get<Response>(`/api/quote-requests?status=${encodeURIComponent(status)}`),
  });
  const search = useRowSearch(data?.requests, (r) => [r.client_name, r.reference, r.insurer_name, r.class_of_business, r.request_type, r.source]);

  function updateStatus(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("status", value);
    else next.delete("status");
    setSearchParams(next);
  }

  const columns: DataGridColumn<QuoteRequestRow>[] = [
    { key: "date", header: "Date", render: (r) => <span className="nowrap">{(r.created_at || "").slice(0, 10)}</span> },
    { key: "client", header: "Client", render: (r) => <Link to={`/quote-requests/${r.id}`}>{r.client_name}</Link> },
    { key: "type", header: "Source", render: (r) => (r.source === "marketplace" ? `Website ${r.reference || ""}`.trim() : `Portal · ${r.request_type}`) },
    { key: "insurer", header: "Preferred insurer", render: (r) => r.insurer_name || "—" },
    { key: "class", header: "Class", render: (r) => r.class_of_business || "—" },
    { key: "sum_insured", header: "Est. Sum Insured", align: "right", render: (r) => fmtMoney(r.sum_insured_estimate) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  // This endpoint is not paginated, so the figures cover every listed request.
  const rows = data?.requests ?? [];
  const count = (name: string) => rows.filter((r) => r.status === name).length;
  const estimate = rows.reduce((sum, r) => sum + (Number(r.sum_insured_estimate) || 0), 0);
  const metrics: Metric[] = [
    { key: "total", label: status ? `${status} requests` : "All requests", value: rows.length },
    { key: "new", label: "New", value: count("New"), tone: count("New") ? "warn" : "neutral", note: "Not yet picked up" },
    { key: "review", label: "In review", value: count("In Review") },
    { key: "quoted", label: "Quoted", value: count("Quoted"), tone: "good" },
    { key: "sum", label: "Est. sum insured", value: fmtMoneyShort(estimate), title: fmtMoney(estimate) },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Customer Portal &amp; Website</span>
          <h1>Quote Requests</h1>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Quote request summary" />

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Quote request filters">
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => updateStatus(e.target.value)}>
            <option value="">All</option>
            {data?.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {status && (
          <button type="button" className="exec-filter-clear" onClick={() => updateStatus("")}>
            Clear filter
          </button>
        )}
      </form>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Client, reference, insurer or class…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(r) => r.id} emptyMessage="No quote requests found." />
    </div>
  );
}
