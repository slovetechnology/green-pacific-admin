import { useCallback, useEffect, useState } from "react";
import { ListSearch } from "@/shared/components/ListSearch";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import "@/shared/styles/executive.css";

interface InsurerRow {
  id: number;
  name: string;
  insurer_ref: string | null;
  licence_no: string | null;
  insurer_class: string | null;
  quote_email: string | null;
  n_tx: number;
  brokerage: number;
}

interface InsurersListResponse {
  insurers: InsurerRow[];
  page: number;
  totalPages: number;
  total: number;
}

// The slice of GET /api/insurers/:id the drawer shows.
interface InsurerDetail {
  insurer: { id: number; name: string; address: string | null; insurer_ref: string | null; licence_no: string | null; insurer_class: string | null; quote_email: string | null };
  transactions: {
    id: number;
    client_name: string;
    policy_no: string | null;
    class_of_business: string | null;
    trans_date: string | null;
    premium_due: number;
    balance_os: number;
    status: string | null;
  }[];
}

function InsurerDrawerBody({ row }: { row: InsurerRow }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["insurer-preview", row.id],
    queryFn: () => api.get<InsurerDetail>(`/api/insurers/${row.id}`),
  });
  if (isLoading) return <p className="exec-state">Loading insurer…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load this insurer.</p>;

  const txs = data.transactions;
  const premium = txs.reduce((sum, t) => sum + (Number(t.premium_due) || 0), 0);
  const owed = txs.reduce((sum, t) => sum + Math.max(0, Number(t.balance_os) || 0), 0);
  const collected = premium > 0 ? Math.min(100, Math.max(0, ((premium - owed) / premium) * 100)) : 0;
  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Reference</dt><dd>{data.insurer.insurer_ref || "—"}</dd></div>
        <div className="exec-field"><dt>Licence No.</dt><dd>{data.insurer.licence_no || "—"}</dd></div>
        <div className="exec-field"><dt>Class</dt><dd>{data.insurer.insurer_class || "—"}</dd></div>
        <div className="exec-field"><dt>Quote email</dt><dd>{data.insurer.quote_email || "—"}</dd></div>
        <div className="exec-field"><dt>Address</dt><dd>{data.insurer.address || "—"}</dd></div>
        <div className="exec-field"><dt>Policies</dt><dd>{txs.length.toLocaleString()}</dd></div>
        <div className="exec-field"><dt>Premium placed</dt><dd>{fmtMoney(premium)}</dd></div>
        <div className="exec-field"><dt>Brokerage</dt><dd>{fmtMoney(row.brokerage)}</dd></div>
        <div className="exec-field"><dt>Balance O/S</dt><dd className={owed > 0 ? "is-crit" : undefined}>{fmtMoney(owed)}</dd></div>
      </dl>

      <div className="exec-meter-block">
        <div className="exec-meter-label">
          <span>Premium collected</span>
          <span className="exec-num">{collected.toFixed(1)}%</span>
        </div>
        <div className="exec-meter" role="img" aria-label={`${collected.toFixed(1)}% of premium collected`}>
          <span className={collected >= 90 ? "is-good" : collected >= 60 ? "is-warn" : "is-crit"} style={{ width: `${collected}%` }} />
        </div>
      </div>

      <section>
        <h3 className="exec-sub">Latest policies</h3>
        {txs.length === 0 ? (
          <p className="exec-state">No policies yet.</p>
        ) : (
          <div className="exec-table-wrap exec-panel">
            <table className="exec-table is-static exec-mini-table">
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {txs.slice(0, 6).map((t) => (
                  <tr key={t.id}>
                    <td className="wrap">
                      <Link to={`/transactions/${t.id}`}>{t.policy_no || `#${t.id}`}</Link>
                      <div className="exec-dl-note">
                        {t.client_name} · {t.class_of_business || "—"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="num">{fmtMoney(t.balance_os)}</td>
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

export function InsurersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(searchParams.get("page") || "1");
  const q = searchParams.get("q") || "";
  const [qInput, setQInput] = useState(q);
  // Searching waits for a pause in typing, then goes back to page 1.
  useEffect(() => {
    if (qInput === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (qInput) next.set("q", qInput);
      else next.delete("q");
      next.delete("page");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, q, searchParams, setSearchParams]);
  const [selected, setSelected] = useState<InsurerRow | null>(null);
  const { user } = useAuth();
  const closeDrawer = useCallback(() => setSelected(null), []);

  const { data, isLoading } = useQuery({
    queryKey: ["insurers", page, q],
    queryFn: () => api.get<InsurersListResponse>(`/api/insurers?page=${page}&q=${encodeURIComponent(q)}`),
  });

  const columns: DataGridColumn<InsurerRow>[] = [
    { key: "name", header: "Name", render: (i) => <Link to={`/insurers/${i.id}`}>{i.name}</Link> },
    { key: "ref", header: "Ref", render: (i) => i.insurer_ref || "—" },
    { key: "licence", header: "Licence No.", render: (i) => i.licence_no || "—" },
    { key: "class", header: "Class", render: (i) => i.insurer_class || "—" },
    { key: "n_tx", header: "Policies", align: "right", render: (i) => i.n_tx.toLocaleString() },
    { key: "brokerage", header: "Brokerage", align: "right", render: (i) => fmtMoney(i.brokerage) },
    {
      key: "preview",
      header: <span className="sr-only">Preview</span>,
      align: "right",
      render: (i) => (
        <button type="button" className="exec-rowbtn" onClick={() => setSelected(i)} aria-label={`Preview ${i.name}`}>
          Preview
        </button>
      ),
    },
  ];

  // The list is paginated, so everything except the total describes this page.
  const rows = data?.insurers ?? [];
  const brokerage = rows.reduce((sum, i) => sum + (Number(i.brokerage) || 0), 0);
  const top = rows.reduce<InsurerRow | null>((best, i) => (!best || i.brokerage > best.brokerage ? i : best), null);
  const metrics: Metric[] = [
    { key: "total", label: q ? "Matching insurers" : "Insurers", value: (data?.total ?? 0).toLocaleString() },
    { key: "policies", label: "Policies (this page)", value: rows.reduce((sum, i) => sum + i.n_tx, 0).toLocaleString() },
    { key: "brokerage", label: "Brokerage (this page)", value: fmtMoneyShort(brokerage), title: fmtMoney(brokerage), tone: "good" },
    { key: "top", label: "Top earner (this page)", value: top && top.brokerage > 0 ? top.name : "—", note: top && top.brokerage > 0 ? fmtMoney(top.brokerage) : undefined },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Directory</span>
          <h1>Insurers</h1>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            {user?.isAdmin && (
              <Link className="btn btn-secondary btn-sm" to="/insurers/directory-import">
                Load insurer directory
              </Link>
            )}
            <Link className="btn btn-secondary btn-sm" to="/insurers/import">
              Upload insurers
            </Link>
            <button type="button" className="btn btn-sm" onClick={() => navigate("/insurers/new")}>
              + New insurer
            </button>
          </div>
        </RoleGate>
      </header>

      <MetricStrip metrics={metrics} label="Insurer summary" />

      <ListSearch value={qInput} onChange={setQInput} placeholder="Name, INS ref, licence no. or email…" />

      <DataGrid
        columns={columns}
        rows={data?.insurers}
        isLoading={isLoading}
        getRowKey={(i) => i.id}
        onRowClick={setSelected}
        isRowSelected={(i) => i.id === selected?.id}
        emptyMessage="No insurers found."
        paging={
          data
            ? {
                page: data.page,
                totalPages: data.totalPages,
                total: data.total,
                onPageChange: (p) => setSearchParams({ page: String(p) }),
              }
            : undefined
        }
      />

      <SideDrawer
        open={selected !== null}
        onClose={closeDrawer}
        title={selected?.name ?? "Insurer"}
        subtitle="Insurer preview"
        footer={
          selected && (
            <>
              <Link className="btn btn-sm" to={`/insurers/${selected.id}`}>
                Open insurer
              </Link>
              <RoleGate need="write">
                <Link className="btn btn-secondary btn-sm" to={`/insurers/${selected.id}/edit`}>
                  Edit
                </Link>
              </RoleGate>
            </>
          )
        }
      >
        {selected && <InsurerDrawerBody row={selected} />}
      </SideDrawer>
    </div>
  );
}
