import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtCurrency, fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ReportSearch } from "../components/ReportSearch";

interface Row {
  id: number; trans_date: string; insurer: string; policy_no: string; insurer_certificate_no: string; naicom_certificate_id: string;
  document_type: string; bl_no: string; invoice_no: string; vessel: string; voyage: string; cargo: string; currency: string;
  sum_insured: number; premium_rate: number | null; premium_due: number; commission_rate: number; brokerage: number; net_payable: number;
}
interface Totals { currency: string; count: number; sum_insured: number; premium_due: number; brokerage: number; net_payable: number }
interface ClientBlock { client_id: number; client: string; client_ref: string; address: string; count: number; rows: Row[]; totals: Totals[] }
interface Response {
  clients: ClientBlock[];
  grand: Totals[];
  rowCount: number;
  clientOptions: { id: number; name: string }[];
  insurers: { id: number; name: string }[];
  periodLabel: string;
}

const FILTERS = ["client_id", "insurer_id", "from", "to", "q"] as const;
const dash = (v: string) => v || "—";

// Marine Cargo certificates declared for each client in a period, with their shipment details and money, and the
// totals per client and currency. The PDF is the formal declaration statement sent to the client.
export function MarineDeclarationReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const f = Object.fromEntries(FILTERS.map((k) => [k, searchParams.get(k) || ""])) as Record<(typeof FILTERS)[number], string>;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const suffix = qs ? `?${qs}` : "";

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "marine-declaration", qs],
    queryFn: () => api.get<Response>(`/api/reports/marine-declaration${suffix}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "trans_date", header: "Date", render: (r) => <span style={{ whiteSpace: "nowrap" }}>{dash(r.trans_date)}</span> },
    ...(f.insurer_id ? [] : [{ key: "insurer", header: "Insurer / Underwriter", render: (r: Row) => r.insurer }]),
    { key: "policy_no", header: "Insurer's Policy No", render: (r) => <Link to={`/transactions/${r.id}`}>{r.policy_no || `#${r.id}`}</Link> },
    { key: "insurer_certificate_no", header: "Insurer's Cert No", render: (r) => dash(r.insurer_certificate_no) },
    { key: "naicom_certificate_id", header: "NAICOM Cert ID", render: (r) => dash(r.naicom_certificate_id) },
    { key: "bl_no", header: "B/L No", render: (r) => dash(r.bl_no) },
    { key: "invoice_no", header: "Invoice No", render: (r) => dash(r.invoice_no) },
    { key: "vessel", header: "Vessel", render: (r) => dash(r.vessel) },
    { key: "voyage", header: "Voyage / Route", render: (r) => dash(r.voyage) },
    { key: "cargo", header: "Cargo / Interest", render: (r) => <span title={r.cargo}>{r.cargo.length > 60 ? `${r.cargo.slice(0, 60)}…` : dash(r.cargo)}</span> },
    { key: "currency", header: "Ccy", render: (r) => r.currency },
    { key: "sum_insured", header: "Sum Insured", align: "right", render: (r) => fmtCurrency(r.sum_insured, r.currency) },
    { key: "premium_rate", header: "Rate %", align: "right", render: (r) => (r.premium_rate === null ? "—" : r.premium_rate.toFixed(4)) },
    { key: "premium_due", header: "Premium Due", align: "right", render: (r) => fmtCurrency(r.premium_due, r.currency) },
    { key: "commission_rate", header: "Brok. %", align: "right", render: (r) => r.commission_rate.toFixed(2) },
    { key: "brokerage", header: "Brokerage", align: "right", render: (r) => fmtCurrency(r.brokerage, r.currency) },
    { key: "net_payable", header: "Net Payable", align: "right", render: (r) => fmtCurrency(r.net_payable, r.currency) },
  ];
  // Columns before "Ccy" in the totals footer.
  const leadCols = columns.findIndex((c) => c.key === "currency");

  const totalsFooter = (label: string, totals: Totals[]) =>
    totals.map((t) => (
      <tr key={t.currency} style={{ fontWeight: 700 }}>
        <td colSpan={leadCols}>{label} ({t.count} certificate{t.count === 1 ? "" : "s"})</td>
        <td>{t.currency}</td>
        <td className="num">{fmtCurrency(t.sum_insured, t.currency)}</td>
        <td></td>
        <td className="num">{fmtCurrency(t.premium_due, t.currency)}</td>
        <td></td>
        <td className="num">{fmtCurrency(t.brokerage, t.currency)}</td>
        <td className="num">{fmtCurrency(t.net_payable, t.currency)}</td>
      </tr>
    ));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Marine Declaration</h1>
          <p className="muted">Marine Cargo certificates declared per client, with shipment details and the premium, brokerage and net payable to underwriters.</p>
        </div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`/api/reports/marine-declaration/excel${suffix}`)}>Download Excel</a>
          <a className="btn" href={apiUrl(`/api/reports/marine-declaration/pdf${suffix}`)}>Download PDF</a>
        </div>
      </div>

      <div className="toolbar">
        <ReportSearch key={f.q} value={f.q} onSearch={(v) => setFilter("q", v)} />
        <select aria-label="Client" value={f.client_id} onChange={(e) => setFilter("client_id", e.target.value)}>
          <option value="">All clients</option>
          {(data?.clientOptions || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Underwriter" value={f.insurer_id} onChange={(e) => setFilter("insurer_id", e.target.value)}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <label className="muted">From <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setFilter("from", e.target.value)} /></label>
        <label className="muted">To <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setFilter("to", e.target.value)} /></label>
      </div>

      {data && (
        <div className="kpi-row">
          <div className="card kpi-card"><div className="kpi-label">Certificates · {data.periodLabel}</div><div className="kpi-value">{data.rowCount}</div></div>
          {(["premium_due", "brokerage", "net_payable"] as const).map((k) => (
            <div key={k} className="card kpi-card">
              <div className="kpi-label">{{ premium_due: "Premium due", brokerage: "Brokerage", net_payable: "Net payable to underwriters" }[k]}</div>
              <div className="kpi-value">
                {data.grand.length ? data.grand.map((t) => <div key={t.currency}>{fmtCurrency(t[k], t.currency)}</div>) : fmtMoney(0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {isLoading || !data || data.clients.length === 0 ? (
        <DataGrid columns={columns} rows={data ? [] : undefined} isLoading={isLoading} getRowKey={(r) => String(r.id)} emptyMessage="No marine cargo declarations for these filters." />
      ) : (
        data.clients.map((c) => (
          <div key={c.client_id} className="card" style={{ marginBottom: "var(--space-6)" }}>
            <div className="section-title">{c.client}</div>
            <p className="muted" style={{ marginTop: 0 }}>
              {[c.client_ref, c.address].filter(Boolean).join(" · ") || "No address on file"}
            </p>
            <DataGrid
              columns={columns}
              rows={c.rows}
              isLoading={false}
              getRowKey={(r) => String(r.id)}
              footer={<>{totalsFooter("TOTAL", c.totals)}</>}
            />
          </div>
        ))
      )}

      {data && data.clients.length > 1 && (
        <div className="card">
          <div className="section-title">Summary by client</div>
          <DataGrid
            columns={[
              { key: "client", header: "Client", render: (s: ClientBlock & Totals) => s.client },
              { key: "currency", header: "Ccy", render: (s) => s.currency },
              { key: "count", header: "Certificates", align: "right", render: (s) => s.count },
              { key: "sum_insured", header: "Sum Insured", align: "right", render: (s) => fmtCurrency(s.sum_insured, s.currency) },
              { key: "premium_due", header: "Premium Due", align: "right", render: (s) => fmtCurrency(s.premium_due, s.currency) },
              { key: "brokerage", header: "Brokerage", align: "right", render: (s) => fmtCurrency(s.brokerage, s.currency) },
              { key: "net_payable", header: "Net Payable", align: "right", render: (s) => fmtCurrency(s.net_payable, s.currency) },
            ]}
            rows={data.clients.flatMap((c) => c.totals.map((t) => ({ ...c, ...t })))}
            isLoading={false}
            getRowKey={(s) => `${s.client_id}-${s.currency}`}
            footer={<>{data.grand.map((t) => (
              <tr key={t.currency} style={{ fontWeight: 700 }}>
                <td>GRAND TOTAL</td><td>{t.currency}</td><td className="num">{t.count}</td><td className="num">{fmtCurrency(t.sum_insured, t.currency)}</td>
                <td className="num">{fmtCurrency(t.premium_due, t.currency)}</td><td className="num">{fmtCurrency(t.brokerage, t.currency)}</td><td className="num">{fmtCurrency(t.net_payable, t.currency)}</td>
              </tr>
            ))}</>}
          />
        </div>
      )}
    </div>
  );
}
