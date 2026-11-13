import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { ReportSearch } from "../components/ReportSearch";

interface YearRow {
  year: string;
  claims: number;
  premium_due: number;
  claimed_amount: number;
  reserve_amount: number;
  approved_amount: number;
  incurred_amount: number;
  loss_ratio: number | null;
}

interface PolicyRow {
  id: number;
  claim_no: string;
  loss_date: string | null;
  client: string;
  policy_no: string | null;
  class_of_business: string | null;
  insurer: string | null;
  status: string;
  premium_due: number;
  claimed_amount: number;
  reserve_amount: number;
  approved_amount: number;
  incurred_amount: number;
  loss_ratio: number | null;
}

interface ReportResponse {
  yearlyRows: YearRow[];
  policyRows: PolicyRow[];
  totals: YearRow;
  years: string[];
  clients: { id: number; name: string }[];
  classesOfBusiness: string[];
  statuses: string[];
  filterDesc: string;
}

function ratio(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function LossExperienceReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qs = searchParams.toString();
  const year = searchParams.get("year") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const clientId = searchParams.get("client_id") || "";
  const classOfBusiness = searchParams.get("class_of_business") || "";
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "loss-experience", qs],
    queryFn: () => api.get<ReportResponse>(`/api/reports/loss-experience${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "year" && value) {
      next.delete("from");
      next.delete("to");
    }
    if ((key === "from" || key === "to") && value) next.delete("year");
    setSearchParams(next);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Claims &amp; underwriting</p>
          <h1>Loss Experience</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`/api/reports/loss-experience/excel${qs ? `?${qs}` : ""}`)}>Download Excel</a>
          <a className="btn" href={apiUrl(`/api/reports/loss-experience/pdf${qs ? `?${qs}` : ""}`)}>Download PDF</a>
        </div>
      </div>
      <p className="page-lede">Compare claim frequency and incurred losses against the premium written for each client policy.</p>

      <div className="toolbar">
        <ReportSearch key={q} value={q} onSearch={(v) => setFilter("q", v)} />
        <select value={year} onChange={(e) => setFilter("year", e.target.value)}>
          <option value="">All years</option>
          {(data?.years || []).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="date" aria-label="Losses from" value={from} onChange={(e) => setFilter("from", e.target.value)} />
        <input type="date" aria-label="Losses to" value={to} onChange={(e) => setFilter("to", e.target.value)} />
        <select value={clientId} onChange={(e) => setFilter("client_id", e.target.value)}>
          <option value="">All clients</option>
          {(data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <select value={classOfBusiness} onChange={(e) => setFilter("class_of_business", e.target.value)}>
          <option value="">All classes</option>
          {(data?.classesOfBusiness || []).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All claim statuses</option>
          {(data?.statuses || []).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      {data && (
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="card kpi-card"><div className="kpi-label">Claims</div><div className="kpi-value">{data.totals.claims}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Premium written</div><div className="kpi-value">{fmtMoney(data.totals.premium_due)}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Incurred loss</div><div className="kpi-value">{fmtMoney(data.totals.incurred_amount)}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Loss ratio</div><div className="kpi-value">{ratio(data.totals.loss_ratio)}</div></div>
        </div>
      )}

      <div className="card">
        <div className="section-title">Yearly summary</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Year</th><th className="num">Claims</th><th className="num">Premium</th><th className="num">Claimed</th><th className="num">Reserve</th><th className="num">Approved</th><th className="num">Incurred</th><th className="num">Loss ratio</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={8}>Loading…</td></tr>}
              {!isLoading && data?.yearlyRows.length === 0 && <tr><td colSpan={8} className="empty-state">No claims match these filters.</td></tr>}
              {data?.yearlyRows.map((row) => <tr key={row.year}><td>{row.year}</td><td className="num">{row.claims}</td><td className="num">{fmtMoney(row.premium_due)}</td><td className="num">{fmtMoney(row.claimed_amount)}</td><td className="num">{fmtMoney(row.reserve_amount)}</td><td className="num">{fmtMoney(row.approved_amount)}</td><td className="num">{fmtMoney(row.incurred_amount)}</td><td className="num">{ratio(row.loss_ratio)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Policy-level claims</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Loss date</th><th>Claim no.</th><th>Client</th><th>Policy</th><th>Insurer</th><th>Class</th><th>Status</th><th className="num">Premium</th><th className="num">Incurred</th><th className="num">Loss ratio</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={10}>Loading…</td></tr>}
              {!isLoading && data?.policyRows.length === 0 && <tr><td colSpan={10} className="empty-state">No policy claims match these filters.</td></tr>}
              {data?.policyRows.map((row) => <tr key={row.id}><td>{row.loss_date || "—"}</td><td>{row.claim_no}</td><td>{row.client}</td><td>{row.policy_no || "Unlinked"}</td><td>{row.insurer || "—"}</td><td>{row.class_of_business || "—"}</td><td>{row.status}</td><td className="num">{fmtMoney(row.premium_due)}</td><td className="num">{fmtMoney(row.incurred_amount)}</td><td className="num">{ratio(row.loss_ratio)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
