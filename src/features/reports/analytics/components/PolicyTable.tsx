import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { filterParams, usePolicyTable, type PolicyRow, type TableState } from "../api/analytics";
import { useAnalyticsStore } from "../store/analyticsStore";
import { AnalyticsCard } from "./AnalyticsCard";

const PAGE_SIZES = [10, 25, 50, 100];

interface Column {
  key: string;
  label: string;
  sort?: string;
  numeric?: boolean;
  render: (r: PolicyRow) => React.ReactNode;
}

const COLUMNS: Column[] = [
  { key: "date", label: "Booked", sort: "trans_date", render: (r) => r.transDate },
  { key: "policy", label: "Policy no.", render: (r) => <Link to={`/transactions/${r.id}`}>{r.policyNo || `#${r.id}`}</Link> },
  { key: "client", label: "Client", sort: "client", render: (r) => r.client },
  { key: "insurer", label: "Insurer", sort: "insurer", render: (r) => r.insurer },
  { key: "class", label: "Product line", render: (r) => r.classOfBusiness || "—" },
  { key: "broker", label: "Broker", render: (r) => r.producer || "—" },
  { key: "premium", label: "Premium", sort: "premium_due", numeric: true, render: (r) => fmtMoney(r.premium) },
  { key: "commission", label: "Commission", sort: "total_brokerage", numeric: true, render: (r) => fmtMoney(r.commission) },
  { key: "expiry", label: "Expires", sort: "end_date", render: (r) => r.endDate || "—" },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
];

// The single detail table: the exact rows behind the figures above, under the same filters, with
// server-side search, sort and paging so a large book never travels to the browser.
export const PolicyTable = memo(function PolicyTable() {
  const filters = useAnalyticsStore((s) => s.filters);
  const [state, setTable] = useState<TableState & { fk: string }>({ page: 1, perPage: 25, q: "", sort: "trans_date", dir: "desc", fk: "" });
  const [draft, setDraft] = useState("");
  const filterKey = useMemo(() => filterParams(filters).toString(), [filters]);
  // A different filter set starts again from page 1; the page only counts for the filters it was picked under.
  const table: TableState = { ...state, page: state.fk === filterKey ? state.page : 1 };

  // Debounced search; a new search starts again from page 1.
  useEffect(() => {
    const t = setTimeout(() => setTable((s) => (s.q === draft.trim() ? s : { ...s, q: draft.trim(), page: 1, fk: filterKey })), 300);
    return () => clearTimeout(t);
  }, [draft, filterKey]);

  const { data, isLoading, isFetching, error } = usePolicyTable(filters, table);

  const sortBy = (sort: string) => setTable((s) => ({ ...s, sort, dir: s.sort === sort && s.dir === "desc" ? "asc" : "desc", page: 1, fk: filterKey }));

  return (
    <AnalyticsCard
      eyebrow="Detail"
      title="Policies behind these figures"
      flush
      loading={isLoading}
      stale={isFetching && !isLoading}
      height={320}
      actions={
        <input className="an-search" type="search" placeholder="Search policy no. or client" aria-label="Search policies" value={draft} onChange={(e) => setDraft(e.target.value)} />
      }
    >
      {error ? (
        <p className="exec-state is-crit">Could not load policies.</p>
      ) : (
        data && (
          <>
            <div className="table-wrap an-table">
              <table>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={c.numeric ? "num" : undefined} aria-sort={c.sort && table.sort === c.sort ? (table.dir === "asc" ? "ascending" : "descending") : undefined}>
                        {c.sort ? (
                          <button type="button" className="an-sort" onClick={() => sortBy(c.sort!)}>
                            {c.label}
                            {table.sort === c.sort && <span aria-hidden="true">{table.dir === "asc" ? " ▲" : " ▼"}</span>}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="exec-state">No policies match these filters.</td>
                    </tr>
                  )}
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className={c.numeric ? "num" : undefined}>
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={6}>
                        <strong>All {data.total.toLocaleString()} matching rows</strong>
                      </td>
                      <td className="num"><strong>{fmtMoney(data.totals.premium)}</strong></td>
                      <td className="num"><strong>{fmtMoney(data.totals.commission)}</strong></td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="an-pager">
              <label>
                Rows{" "}
                <select value={table.perPage} onChange={(e) => setTable((s) => ({ ...s, perPage: Number(e.target.value), page: 1, fk: filterKey }))}>
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                Page {data.page} of {data.totalPages}
              </span>
              <button type="button" className="btn-secondary btn btn-sm" disabled={data.page <= 1} onClick={() => setTable((s) => ({ ...s, page: data.page - 1, fk: filterKey }))}>
                Previous
              </button>
              <button type="button" className="btn-secondary btn btn-sm" disabled={data.page >= data.totalPages} onClick={() => setTable((s) => ({ ...s, page: data.page + 1, fk: filterKey }))}>
                Next
              </button>
            </div>
          </>
        )
      )}
    </AnalyticsCard>
  );
});
