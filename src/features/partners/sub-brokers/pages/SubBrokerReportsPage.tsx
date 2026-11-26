import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { useSubBrokerMeta } from "../lib/subBrokers";

// The table model every sub-broker report returns (backend
// lib/subBrokerReports.js); the same model feeds the PDF, Excel and CSV.
interface ReportModel {
  title: string;
  filterDesc: string;
  headers: string[];
  rows: (string | number | null)[][];
  moneyCols: number[];
  totals: (string | number | null)[] | null;
}

type Control = { name: string; label: string; type: "date" | "select" | "number"; options?: [string, string][] };

const GROUP_OPTIONS_PROD: [string, string][] = [["sub_broker", "Sub-broker"], ["class", "Class of business"], ["period", "Month"], ["channel", "Channel"]];
const FROM_TO: Control[] = [{ name: "from", label: "From", type: "date" }, { name: "to", label: "To", type: "date" }];

const REPORT_DEFS: { key: string; label: string; blurb: string; controls: (statuses: string[], officers: [string, string][], states: string[]) => Control[] }[] = [
  {
    key: "production", label: "Production", blurb: "Business received through and placed through each sub-broker, by class and period, with premium and commission.",
    controls: () => [...FROM_TO, { name: "group", label: "Group by", type: "select", options: GROUP_OPTIONS_PROD },
      { name: "channel", label: "Channel", type: "select", options: [["", "Both"], ["Received", "Received through"], ["Placed", "Placed through"]] }],
  },
  {
    key: "ranking", label: "Performance ranking", blurb: "Sub-brokers ranked on the chosen measure, with each one's share of the total.",
    controls: () => [...FROM_TO, { name: "metric", label: "Rank by", type: "select", options: [["brokerage", "Brokerage"], ["premium", "Premium"], ["gross_share", "Gross share"], ["policies", "Policies"]] },
      { name: "limit", label: "Show top", type: "number" }],
  },
  {
    key: "ageing", label: "Commission ageing", blurb: "Unpaid net commission by how long it has been outstanding.",
    controls: () => [{ name: "as_of", label: "As at", type: "date" }],
  },
  {
    key: "deductions", label: "Deductions (VAT, NAICOM levy, misc)", blurb: "What was deducted from sub-brokers, for remittance and reconciliation.",
    controls: () => [...FROM_TO, { name: "basis", label: "Basis", type: "select", options: [["accrued", "Accrued on commission lines"], ["paid", "Withheld on payments made"]] },
      { name: "group", label: "Group by", type: "select", options: [["period", "Month"], ["sub_broker", "Sub-broker (with TIN)"]] }],
  },
  {
    key: "register", label: "Register", blurb: "Every sub-broker with their business, payments and balance.",
    controls: (statuses, officers, states) => [
      { name: "status", label: "Status", type: "select", options: [["", "All"], ...statuses.map((s) => [s, s] as [string, string])] },
      { name: "state", label: "State", type: "select", options: [["", "All"], ...states.map((s) => [s, s] as [string, string])] },
      { name: "officer", label: "Officer", type: "select", options: [["", "All"], ...officers] },
    ],
  },
];

export function SubBrokerReportsPage() {
  const [params, setParams] = useSearchParams();
  const { meta, can } = useSubBrokerMeta();
  const key = params.get("report") || "production";
  const def = REPORT_DEFS.find((d) => d.key === key) ?? REPORT_DEFS[0];
  const [values, setValues] = useState<Record<string, string>>({});

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
  const query = qs.toString();

  const { data, isLoading, error } = useQuery({
    queryKey: ["sub-brokers", "report", def.key, query],
    queryFn: () => api.get<{ model: ReportModel }>(`/api/sub-brokers/reports/${def.key}${query ? `?${query}` : ""}`),
    enabled: can("subbroker.report"),
    retry: false,
  });

  if (meta && !can("subbroker.report")) return <div className="flash flash-error">You don't have permission to view sub-broker reports.</div>;
  const model = data?.model;
  const controls = def.controls(meta?.statuses ?? [], (meta?.officers ?? []).map((o) => [String(o.id), o.username] as [string, string]), meta?.states ?? []);
  const cell = (v: string | number | null, col: number) =>
    v === null || v === "" ? "" : typeof v === "number" ? (model?.moneyCols.includes(col) ? fmtMoney(v) : v.toLocaleString()) : v;
  const exportHref = (fmt: string) => apiUrl(`/api/sub-brokers/reports/${def.key}/${fmt}${query ? `?${query}` : ""}`);

  return (
    <div>
      <div className="page-header">
        <div><p className="eyebrow">Sub-Brokers</p><h1>Reports</h1></div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={exportHref("csv")}>CSV</a>
          <a className="btn-secondary btn" href={exportHref("excel")}>Excel</a>
          <a className="btn btn" href={exportHref("pdf")}>PDF</a>
          <Link className="btn-secondary btn" to="/sub-brokers">Back</Link>
        </div>
      </div>

      <div className="toolbar" role="tablist" aria-label="Reports">
        {REPORT_DEFS.map((d) => (
          <button key={d.key} type="button" role="tab" aria-selected={d.key === def.key} className={d.key === def.key ? "btn btn-sm" : "btn-secondary btn btn-sm"}
            onClick={() => { setValues({}); setParams({ report: d.key }); }}>
            {d.label}
          </button>
        ))}
      </div>
      <p className="muted">{def.blurb}</p>

      <div className="toolbar">
        {controls.map((c) => (
          <label key={c.name} style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: "0.2rem" }}>
            {c.label}
            {c.type === "select" ? (
              <select value={values[c.name] ?? c.options?.[0]?.[0] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}>
                {c.options?.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            ) : (
              <input type={c.type} min={c.type === "number" ? 1 : undefined} value={values[c.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} />
            )}
          </label>
        ))}
      </div>

      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the report."}</div>}
      <div className="card">
        {model && <p className="muted" style={{ marginTop: 0 }}>{model.filterDesc} · {model.rows.length} row(s)</p>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>{model?.headers.map((h, i) => <th key={h + i} className={model.moneyCols.includes(i + 1) ? "num" : undefined}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && <tr><td>Loading…</td></tr>}
              {model && !model.rows.length && <tr><td colSpan={model.headers.length}>Nothing to report for these filters.</td></tr>}
              {model?.rows.map((r, ri) => (
                <tr key={ri}>{r.map((v, ci) => <td key={ci} className={model.moneyCols.includes(ci + 1) ? "num" : undefined}>{cell(v, ci + 1)}</td>)}</tr>
              ))}
            </tbody>
            {model?.totals && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>{model.totals.map((v, ci) => <td key={ci} className={model.moneyCols.includes(ci + 1) ? "num" : undefined}>{cell(v, ci + 1)}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
