import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";

interface Row {
  invoice_date: string; debit_note_no: string; client: string; class_of_business: string;
  policy_no: string; premium_due: number; premium_paid: number; premium_os: number;
  insurer: string; status: string;
}
interface Response {
  rows: Row[];
  totals: { premium_due: number; premium_paid: number; premium_os: number };
  byClient: { client: string; premium_os: number; buckets: number[] }[];
  byInsurer: { insurer: string; premium_os: number }[];
  insurers: { id: number; name: string }[];
  months: { value: string; label: string }[];
  statuses: string[];
  activeFilters?: { month: string };
  filterDesc: string;
}

const AGE_BUCKETS = ["0-30 days", "31-60 days", "61-90 days", "91-120 days", "120+ days"];

export function PremiumAgeReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const status = searchParams.get("status") || "";
  const month = searchParams.get("month") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const q = searchParams.get("q") || "";
  const period = Boolean(from && to);
  const [qInput, setQInput] = useState(q);
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(status && { status }),
    ...(month && !period && { month }),
    ...(period && { from, to }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "premium-age", qs],
    queryFn: () => api.get<Response>(`/api/reports/premium-age${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Premium Age Analysis</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`/api/reports/premium-age/excel${qs ? `?${qs}` : ""}`)}>
            Download Excel
          </a>
          <a className="btn" href={apiUrl(`/api/reports/premium-age/pdf${qs ? `?${qs}` : ""}`)}>
            Download PDF
          </a>
        </div>
      </div>

      {data?.filterDesc && <p className="page-lede">{data.filterDesc}</p>}

      <div className="toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilter("q", qInput);
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input type="search" placeholder="Search client, policy, debit note…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <button type="submit" className="btn-secondary btn">
            Search
          </button>
        </form>
        <select value={insurerId} onChange={(e) => setFilter("insurer_id", e.target.value)}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select
          value={period ? "" : month || data?.activeFilters?.month || ""}
          onChange={(e) => {
            const next = new URLSearchParams(searchParams);
            next.delete("from");
            next.delete("to");
            if (e.target.value) next.set("month", e.target.value);
            else next.delete("month");
            setSearchParams(next);
          }}
        >
          {period && <option value="">Specified period</option>}
          {(data?.months || []).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label>
          Period from <input type="date" value={from} max={to || undefined} onChange={(e) => setFilter("from", e.target.value)} />
        </label>
        <label>
          to <input type="date" value={to} min={from || undefined} onChange={(e) => setFilter("to", e.target.value)} />
        </label>
        {(from || to) && (
          <button
            type="button"
            className="btn-secondary btn"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("from");
              next.delete("to");
              setSearchParams(next);
            }}
          >
            Clear period
          </button>
        )}
        <select value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {(data?.statuses || []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice Date</th>
                <th>Debit Note</th>
                <th>Client</th>
                <th>Class</th>
                <th>Policy No</th>
                <th className="num">Premium Due</th>
                <th className="num">Premium Paid</th>
                <th className="num">Premium O/S</th>
                <th>Insurer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10}>Loading…</td>
                </tr>
              )}
              {!isLoading && data?.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-state">
                    No outstanding premium for this period.
                  </td>
                </tr>
              )}
              {data?.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.invoice_date}</td>
                  <td>{r.debit_note_no || "—"}</td>
                  <td>{r.client}</td>
                  <td>{r.class_of_business}</td>
                  <td>{r.policy_no}</td>
                  <td className="num">{fmtMoney(r.premium_due)}</td>
                  <td className="num">{fmtMoney(r.premium_paid)}</td>
                  <td className="num">{fmtMoney(r.premium_os)}</td>
                  <td>{r.insurer}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={5}>TOTAL</td>
                  <td className="num">{fmtMoney(data.totals.premium_due)}</td>
                  <td className="num">{fmtMoney(data.totals.premium_paid)}</td>
                  <td className="num">{fmtMoney(data.totals.premium_os)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Summary by Client</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  {AGE_BUCKETS.map((b) => (
                    <th key={b} className="num">{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.byClient || []).map((r) => (
                  <tr key={r.client}>
                    <td>{r.client}</td>
                    {r.buckets.map((v, i) => (
                      <td key={i} className="num">{fmtMoney(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Summary by Insurer</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Insurer</th>
                  <th className="num">Premium O/S</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byInsurer || []).map((r) => (
                  <tr key={r.insurer}>
                    <td>{r.insurer}</td>
                    <td className="num">{fmtMoney(r.premium_os)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
