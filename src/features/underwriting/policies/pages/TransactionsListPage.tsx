import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import "@/shared/styles/executive.css";

interface TransactionRow {
  id: number;
  trans_date: string | null;
  client_name: string;
  insurer_name: string;
  policy_no: string | null;
  premium_due: number;
  balance_os: number;
  status: string | null;
}

interface TransactionsListResponse {
  transactions: TransactionRow[];
  statuses: string[];
  status: string;
  years: string[];
  year: string;
  q: string;
  page: number;
  totalPages: number;
  total: number;
}

// The slice of GET /api/transactions/:id the preview drawer shows.
interface TransactionPreview {
  transaction: {
    id: number;
    client_id: number;
    client_name: string;
    insurer_name: string;
    policy_no: string | null;
    class_of_business: string | null;
    business_type: string | null;
    billing_mode: string | null;
    start_date: string | null;
    end_date: string | null;
    premium_due: number;
    premium_paid: number;
    balance_os: number;
    total_brokerage: number;
    status: string | null;
  };
  complianceExceptions: { id: number; rule_name: string; severity: string; status: string }[];
}

function TransactionDrawerBody({ txId }: { txId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["transaction-preview", txId],
    queryFn: () => api.get<TransactionPreview>(`/api/transactions/${txId}`),
  });
  if (isLoading) return <p className="exec-state">Loading policy…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load this policy.</p>;

  const t = data.transaction;
  const paidPct = t.premium_due > 0 ? Math.min(100, Math.max(0, (t.premium_paid / t.premium_due) * 100)) : 0;
  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Client</dt><dd><Link to={`/clients/${t.client_id}`}>{t.client_name}</Link></dd></div>
        <div className="exec-field"><dt>Insurer</dt><dd>{t.insurer_name}</dd></div>
        <div className="exec-field"><dt>Policy no.</dt><dd>{t.policy_no || "—"}</dd></div>
        <div className="exec-field"><dt>Class</dt><dd>{t.class_of_business || "—"}</dd></div>
        <div className="exec-field"><dt>Business type</dt><dd>{t.business_type || "—"}</dd></div>
        <div className="exec-field"><dt>Billing</dt><dd>{t.billing_mode || "Agency"}</dd></div>
        <div className="exec-field"><dt>Period</dt><dd>{t.start_date || "—"} → {t.end_date || "—"}</dd></div>
        <div className="exec-field"><dt>Status</dt><dd><StatusBadge status={t.status} /></dd></div>
      </dl>

      <section>
        <h3 className="exec-sub">Premium</h3>
        <dl className="exec-fields">
          <div className="exec-field"><dt>Premium due</dt><dd>{fmtMoney(t.premium_due)}</dd></div>
          <div className="exec-field"><dt>Paid</dt><dd>{fmtMoney(t.premium_paid)}</dd></div>
          <div className="exec-field"><dt>Balance O/S</dt><dd className={t.balance_os > 0 ? "is-crit" : undefined}>{fmtMoney(t.balance_os)}</dd></div>
          <div className="exec-field"><dt>Brokerage</dt><dd>{fmtMoney(t.total_brokerage)}</dd></div>
        </dl>
        <div className="exec-meter-block" style={{ marginTop: "0.75rem" }}>
          <div className="exec-meter-label">
            <span>Collected</span>
            <span className="exec-num">{paidPct.toFixed(1)}%</span>
          </div>
          <div className="exec-meter" role="img" aria-label={`${paidPct.toFixed(1)}% of premium collected`}>
            <span className={paidPct >= 100 ? "is-good" : paidPct > 0 ? "is-warn" : "is-crit"} style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="exec-sub">Compliance</h3>
        {data.complianceExceptions.length === 0 ? (
          <p className="exec-state">No open exceptions.</p>
        ) : (
          <ul className="exec-list">
            {data.complianceExceptions.map((e) => (
              <li key={e.id}>
                {e.rule_name} <span className={`badge badge-${e.status.toLowerCase()}`}>{e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function TransactionsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(searchParams.get("page") || "1");
  const status = searchParams.get("status") || "";
  const year = searchParams.get("year") || "";
  const q = searchParams.get("q") || "";
  const [qInput, setQInput] = useState(q);
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const closeDrawer = useCallback(() => setSelected(null), []);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", status, year, q, page],
    queryFn: () =>
      api.get<TransactionsListResponse>(
        `/api/transactions?status=${encodeURIComponent(status)}&year=${encodeURIComponent(year)}&q=${encodeURIComponent(q)}&page=${page}`
      ),
  });

  function updateParams(next: Record<string, string>) {
    setSearchParams({ status, year, q, page: "1", ...next });
  }

  const columns: DataGridColumn<TransactionRow>[] = [
    { key: "date", header: "Date", render: (t) => <Link to={`/transactions/${t.id}`}>{t.trans_date || "—"}</Link> },
    { key: "client", header: "Client", render: (t) => t.client_name },
    { key: "insurer", header: "Insurer", render: (t) => t.insurer_name },
    { key: "policy_no", header: "Policy No", render: (t) => <span className="nowrap">{t.policy_no || "—"}</span> },
    { key: "premium_due", header: "Premium Due", align: "right", render: (t) => fmtMoney(t.premium_due) },
    {
      key: "balance_os",
      header: "Balance O/S",
      align: "right",
      render: (t) => <span className={t.balance_os > 0 ? "is-crit" : undefined}>{fmtMoney(t.balance_os)}</span>,
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "preview",
      header: <span className="sr-only">Preview</span>,
      align: "right",
      render: (t) => (
        <button type="button" className="exec-rowbtn" onClick={() => setSelected(t)} aria-label={`Preview policy ${t.policy_no || t.id}`}>
          Preview
        </button>
      ),
    },
  ];

  // The list is paginated, so everything except the total describes this page.
  const rows = data?.transactions ?? [];
  const premium = rows.reduce((sum, t) => sum + (Number(t.premium_due) || 0), 0);
  const balance = rows.reduce((sum, t) => sum + (Number(t.balance_os) || 0), 0);
  const unpaid = rows.filter((t) => t.status === "Unpaid").length;
  const metrics: Metric[] = [
    { key: "total", label: status || year || q ? "Matching transactions" : "All transactions", value: (data?.total ?? 0).toLocaleString() },
    { key: "premium", label: "Premium due (this page)", value: fmtMoneyShort(premium), title: fmtMoney(premium) },
    { key: "balance", label: "Balance O/S (this page)", value: fmtMoneyShort(balance), title: fmtMoney(balance), tone: balance > 0 ? "crit" : "neutral" },
    { key: "unpaid", label: "Unpaid (this page)", value: unpaid, tone: unpaid ? "warn" : "neutral" },
    {
      key: "collected",
      label: "Collected (this page)",
      value: premium > 0 ? `${(((premium - balance) / premium) * 100).toFixed(1)}%` : "—",
      tone: "good",
    },
  ];

  const activeFilters = [status, year, q].filter(Boolean).length;

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Ledger</span>
          <h1>Transactions</h1>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate("/transactions/import")}>
              Upload transactions
            </button>
            <button type="button" className="btn btn-sm" onClick={() => navigate("/transactions/new")}>
              + New transaction
            </button>
          </div>
        </RoleGate>
      </header>

      <MetricStrip metrics={metrics} label="Transaction summary" />

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
          <input type="search" placeholder="Client, policy, insurer…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => updateParams({ status: e.target.value })}>
            <option value="">All</option>
            {(data?.statuses || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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
        rows={data?.transactions}
        isLoading={isLoading}
        getRowKey={(t) => t.id}
        onRowClick={setSelected}
        isRowSelected={(t) => t.id === selected?.id}
        emptyMessage="No transactions found."
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
        title={selected?.policy_no || (selected ? `Transaction #${selected.id}` : "Transaction")}
        subtitle={selected ? `${selected.client_name} · ${selected.insurer_name}` : undefined}
        footer={
          selected && (
            <>
              <Link className="btn btn-sm" to={`/transactions/${selected.id}`}>
                Open policy
              </Link>
              <RoleGate need="write">
                <Link className="btn btn-secondary btn-sm" to={`/transactions/${selected.id}/edit`}>
                  Edit
                </Link>
              </RoleGate>
            </>
          )
        }
      >
        {selected && <TransactionDrawerBody txId={selected.id} />}
      </SideDrawer>
    </div>
  );
}
