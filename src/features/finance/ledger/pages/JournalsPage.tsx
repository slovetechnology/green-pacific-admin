import "@/shared/styles/ledger.css";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Pagination } from "@/shared/components/Pagination";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { KIND_LABEL, SOURCE_LABEL, fmtMinor, useGlAccess, type JournalRow } from "../api/ledger";

/** Every journal: automatic postings from receipts and the like, manual journals, opening balances, reversals. */
export function JournalsPage() {
  const access = useGlAccess();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const filters = Object.fromEntries(["status", "kind", "source_type", "from", "to", "q", "page"].map((k) => [k, params.get(k) ?? ""]));
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { data, isLoading } = useQuery({
    queryKey: ["gl", "journals", query.toString()],
    queryFn: () => api.get<{ journals: JournalRow[]; total: number; totalPages: number; page: number }>(`/api/gl/journals?${query}`),
  });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Journals</h1>
        </div>
        {access.can("gl.journal.create") && (
          <div className="page-header-actions">
            <Link to="/ledger/journals/new?kind=opening" className="btn btn-secondary">Opening balances</Link>
            <Link to="/ledger/journals/new" className="btn">+ New journal</Link>
          </div>
        )}
      </div>
      <div className="card">
        <div className="toolbar">
          <form onSubmit={(e) => { e.preventDefault(); set("q", q.trim()); }} className="ledger-search">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="JV number or description…" aria-label="Search journals" />
          </form>
          <select value={filters.status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="Draft">Awaiting approval</option>
            <option value="Posted">Posted</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select value={filters.kind} onChange={(e) => set("kind", e.target.value)} aria-label="Kind">
            <option value="">All kinds</option>
            {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={filters.source_type} onChange={(e) => set("source_type", e.target.value)} aria-label="Source">
            <option value="">Any source</option>
            {Object.entries(SOURCE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-label="From" />
          <input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-label="To" />
        </div>
      </div>
      <div className="card">
        {isLoading && <p>Loading…</p>}
        {data && (
          <>
            <p className="ledger-note">{data.total} journal{data.total === 1 ? "" : "s"}</p>
            <div className="table-wrap">
              <table className="data-grid-table">
                <thead>
                  <tr>
                    <th>Journal</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.journals.length === 0 && <tr><td colSpan={6} className="ledger-note">No journals match.</td></tr>}
                  {data.journals.map((j) => (
                    <tr key={j.id}>
                      <td><Link to={`/ledger/journals/${j.id}`}>{j.journal_no ?? `Draft #${j.id}`}</Link></td>
                      <td>{j.journal_date}</td>
                      <td>
                        {j.description}
                        {j.reversed_by_id && <span className="badge badge-cancelled ledger-tag">Reversed</span>}
                      </td>
                      <td>{j.kind === "system" && j.source_type ? SOURCE_LABEL[j.source_type] ?? KIND_LABEL[j.kind] : KIND_LABEL[j.kind]}</td>
                      <td><StatusBadge status={j.status === "Draft" ? "Awaiting approval" : j.status} /></td>
                      <td className="num">{fmtMinor(j.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPageChange={(p: number) => set("page", String(p))} />
          </>
        )}
      </div>
    </div>
  );
}
