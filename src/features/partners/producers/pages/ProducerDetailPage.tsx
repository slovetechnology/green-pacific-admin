import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";

interface Producer {
  id: number;
  name: string;
  monthly_quota: number;
}

interface OpenDeal {
  id: number;
  deal_name: string;
  stage: string;
  estimated_premium: number;
}

interface Response {
  producer: Producer;
  activityCounts: Record<string, number>;
  activityTypes: string[];
  openDeals: OpenDeal[];
  weightedPipeline: number;
  actualCommission: number;
  boundDeals: number;
  periodStart: string;
}

export function ProducerDetailPage() {
  const { producerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const since = searchParams.get("since") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["producers", producerId, since],
    queryFn: () => api.get<Response>(`/api/producers/${producerId}${since ? `?since=${since}` : ""}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Producer not found.</p>;
  const { producer } = data;
  const quotaAttainment = producer.monthly_quota ? (data.actualCommission / producer.monthly_quota) * 100 : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Producer Performance</p>
          <h1>{producer.name}</h1>
        </div>
        <Link className="btn-secondary btn" to="/producers">← All producers</Link>
      </div>

      <div className="toolbar">
        <label htmlFor="since" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Since</label>
        <input
          id="since" type="date" value={data.periodStart}
          onChange={(e) => setSearchParams({ since: e.target.value })}
        />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">Weighted open pipeline</div>
          <div className="kpi-value">{fmtMoney(data.weightedPipeline)}</div>
          <span className="kpi-trend kpi-trend-flat">{data.openDeals.length} open deal(s)</span>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Actual commission (period)</div>
          <div className="kpi-value">{fmtMoney(data.actualCommission)}</div>
          <span className="kpi-trend kpi-trend-flat">vs monthly quota {fmtMoney(producer.monthly_quota)}</span>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Deals bound (period)</div>
          <div className="kpi-value">{data.boundDeals}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Quota attainment</div>
          <div className="kpi-value">{quotaAttainment === null ? "—" : `${quotaAttainment.toFixed(1)}%`}</div>
        </div>
      </div>

      <div className="card">
        <h2>Activity (since {data.periodStart})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activity Type</th>
                <th className="num">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.activityTypes.filter((t) => data.activityCounts[t]).length === 0 && (
                <tr>
                  <td colSpan={2} className="empty-state">No activity logged in this period.</td>
                </tr>
              )}
              {data.activityTypes
                .filter((t) => data.activityCounts[t])
                .map((t) => (
                  <tr key={t}>
                    <td>{t}</td>
                    <td className="num">{data.activityCounts[t]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Open Deals</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Stage</th>
                <th className="num">Est. Premium</th>
              </tr>
            </thead>
            <tbody>
              {data.openDeals.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-state">No open deals assigned.</td>
                </tr>
              )}
              {data.openDeals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/deals/${d.id}`}>{d.deal_name}</Link>
                  </td>
                  <td>
                    <StatusBadge status={d.stage} />
                  </td>
                  <td className="num">{fmtMoney(d.estimated_premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
