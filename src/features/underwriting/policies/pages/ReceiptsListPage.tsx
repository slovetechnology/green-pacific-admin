import { useNavigate, useSearchParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import "@/shared/styles/executive.css";

interface ReceiptRow {
  id: number;
  receipt_no: string;
  receipt_date: string;
  client_name: string;
  payment_method: string;
  total_amount: number;
  status: string;
}

interface Response {
  receipts: ReceiptRow[];
  status: string;
  year: string;
  years: string[];
  q: string;
  page: number;
  totalPages: number;
  total: number;
}

// The slice of GET /api/receipts/:id the drawer shows.
interface ReceiptDetail {
  receipt: {
    id: number;
    payment_reference: string | null;
    narration: string | null;
    vat_levies: number;
    other_charges: number;
    total_amount: number;
    created_by: string | null;
    cancelled_by: string | null;
    cancel_reason: string | null;
  };
  client: { id: number; name: string } | null;
  allocations: {
    id: number;
    amount: number;
    applied_amount: number;
    transaction_id: number;
    policy_no: string | null;
    insurer_name: string;
    class_of_business: string | null;
  }[];
}

function ReceiptDrawerBody({ receiptId }: { receiptId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipt-preview", receiptId],
    queryFn: () => api.get<ReceiptDetail>(`/api/receipts/${receiptId}`),
  });
  if (isLoading) return <p className="exec-state">Loading receipt…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load this receipt.</p>;

  const r = data.receipt;
  return (
    <>
      {r.cancel_reason && (
        <div className="flash flash-error">
          Cancelled{r.cancelled_by ? ` by ${r.cancelled_by}` : ""}: {r.cancel_reason}
        </div>
      )}
      <dl className="exec-fields">
        <div className="exec-field"><dt>Client</dt><dd>{data.client ? <Link to={`/clients/${data.client.id}`}>{data.client.name}</Link> : "—"}</dd></div>
        <div className="exec-field"><dt>Reference</dt><dd>{r.payment_reference || "—"}</dd></div>
        <div className="exec-field"><dt>VAT / levies</dt><dd>{fmtMoney(r.vat_levies)}</dd></div>
        <div className="exec-field"><dt>Other charges</dt><dd>{fmtMoney(r.other_charges)}</dd></div>
        <div className="exec-field"><dt>Total received</dt><dd>{fmtMoney(r.total_amount)}</dd></div>
        <div className="exec-field"><dt>Raised by</dt><dd>{r.created_by || "—"}</dd></div>
        {r.narration && <div className="exec-field"><dt>Narration</dt><dd>{r.narration}</dd></div>}
      </dl>

      <section>
        <h3 className="exec-sub">Allocated to policies</h3>
        {data.allocations.length === 0 ? (
          <p className="exec-state">No allocations.</p>
        ) : (
          <div className="exec-table-wrap exec-panel">
            <table className="exec-table is-static exec-mini-table">
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col" className="num">Receipted</th>
                  <th scope="col" className="num" title="New money that moved premium paid">Applied</th>
                </tr>
              </thead>
              <tbody>
                {data.allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="wrap">
                      <Link to={`/transactions/${a.transaction_id}`}>{a.policy_no || `#${a.transaction_id}`}</Link>
                      <div className="exec-dl-note">
                        {a.insurer_name} · {a.class_of_business || "—"}
                      </div>
                    </td>
                    <td className="num">{fmtMoney(a.amount)}</td>
                    <td className="num">{fmtMoney(a.applied_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function ReceiptsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(searchParams.get("page") || "1");
  const status = searchParams.get("status") || "";
  const year = searchParams.get("year") || "";
  const q = searchParams.get("q") || "";
  const [qInput, setQInput] = useState(q);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const closeDrawer = useCallback(() => setSelected(null), []);

  const { data, isLoading } = useQuery({
    queryKey: ["receipts", status, year, q, page],
    queryFn: () =>
      api.get<Response>(
        `/api/receipts?status=${encodeURIComponent(status)}&year=${encodeURIComponent(year)}&q=${encodeURIComponent(q)}&page=${page}`
      ),
  });

  function updateParams(next: Record<string, string>) {
    setSearchParams({ status, year, q, page: "1", ...next });
  }

  const columns: DataGridColumn<ReceiptRow>[] = [
    { key: "receipt_no", header: "Receipt No", render: (r) => <Link to={`/receipts/${r.id}`}>{r.receipt_no}</Link> },
    { key: "date", header: "Date", render: (r) => r.receipt_date },
    { key: "client", header: "Client", render: (r) => r.client_name },
    { key: "method", header: "Payment Method", render: (r) => r.payment_method },
    {
      key: "amount",
      header: "Total Amount",
      align: "right",
      render: (r) => <span className={r.status === "Cancelled" ? "text-muted" : undefined}>{fmtMoney(r.total_amount)}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (r) => (
        <span className="exec-row-actions">
          <button type="button" className="exec-rowbtn" onClick={() => setSelected(r)} aria-label={`Details for receipt ${r.receipt_no}`}>
            Details
          </button>
          <a className="exec-rowbtn" href={apiUrl(`/api/receipts/${r.id}/pdf?inline=1`)} target="_blank" rel="noreferrer">
            PDF
          </a>
        </span>
      ),
    },
  ];

  // The list is paginated, so everything except the total describes this page.
  const rows = data?.receipts ?? [];
  const live = rows.filter((r) => r.status !== "Cancelled");
  const cancelled = rows.length - live.length;
  const received = live.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
  const metrics: Metric[] = [
    { key: "total", label: status || year || q ? "Matching receipts" : "All receipts", value: (data?.total ?? 0).toLocaleString() },
    { key: "received", label: "Received (this page)", value: fmtMoneyShort(received), title: fmtMoney(received), tone: "good", note: "Active receipts only" },
    { key: "live", label: "Active (this page)", value: live.length },
    { key: "cancelled", label: "Cancelled (this page)", value: cancelled, tone: cancelled ? "warn" : "neutral" },
  ];
  const activeFilters = [status, year, q].filter(Boolean).length;

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Receipts</span>
          <h1>Payment Receipts</h1>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigate("/receipts/import")}>
              Upload receipts
            </button>
            <button type="button" className="btn btn-sm" onClick={() => navigate("/receipts/new")}>
              + New receipt
            </button>
          </div>
        </RoleGate>
      </header>

      <MetricStrip metrics={metrics} label="Receipt summary" />

      <form
        className="exec-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: qInput });
        }}
      >
        <label className="exec-search">
          <span>Search</span>
          <input type="search" placeholder="Receipt no or client…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => updateParams({ status: e.target.value })}>
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </label>
        <label className="exec-filter">
          <span>Year</span>
          <select value={year} onChange={(e) => updateParams({ year: e.target.value })}>
            <option value="">All</option>
            {(data?.years || []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          Search
        </button>
        {activeFilters > 0 && (
          <button
            type="button"
            className="exec-filter-clear"
            onClick={() => {
              setQInput("");
              setSearchParams({ status: "", year: "", q: "", page: "1" });
            }}
          >
            Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
          </button>
        )}
      </form>

      <DataGrid
        columns={columns}
        rows={data?.receipts}
        isLoading={isLoading}
        getRowKey={(r) => r.id}
        onRowClick={setSelected}
        isRowSelected={(r) => r.id === selected?.id}
        emptyMessage="No receipts found."
        paging={
          data
            ? {
                page: data.page,
                totalPages: data.totalPages,
                total: data.total,
                onPageChange: (p) => setSearchParams({ status, year, q, page: String(p) }),
              }
            : undefined
        }
      />

      <SideDrawer
        open={selected !== null}
        onClose={closeDrawer}
        title={selected?.receipt_no ?? "Receipt"}
        subtitle={selected ? `${selected.receipt_date} · ${selected.payment_method} · ${selected.status}` : undefined}
        footer={
          selected && (
            <>
              <Link className="btn btn-sm" to={`/receipts/${selected.id}`}>
                Open receipt
              </Link>
              <a className="btn btn-secondary btn-sm" href={apiUrl(`/api/receipts/${selected.id}/pdf?inline=1`)} target="_blank" rel="noreferrer">
                View PDF
              </a>
            </>
          )
        }
      >
        {selected && <ReceiptDrawerBody receiptId={selected.id} />}
      </SideDrawer>
    </div>
  );
}
