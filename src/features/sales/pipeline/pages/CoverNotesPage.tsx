import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { StatusBadge } from "@/shared/components/StatusBadge";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import type { CoverNote } from "../lib/binding";

// The cover note register across deals (backend sales/binding/coverNotes.js coverNoteRegister): those in force,
// those expiring soon, and the rest by status. Cover notes are issued on a deal's Binding tab.

const VIEWS = [
  { id: "expiring", label: "Expiring within 14 days", query: "expiring=14" },
  { id: "Issued", label: "In force", query: "status=Issued" },
  { id: "Expired", label: "Expired", query: "status=Expired" },
  { id: "Superseded", label: "Replaced", query: "status=Superseded" },
  { id: "Cancelled", label: "Cancelled", query: "status=Cancelled" },
];

export function CoverNotesPage() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.id === params.get("view")) ?? VIEWS[0];
  const { data, isLoading, error } = useQuery({ queryKey: ["cover-notes", view.id], queryFn: () => api.get<{ coverNotes: CoverNote[] }>(`/api/cover-notes?${view.query}`) });
  const inForce = useQuery({ queryKey: ["cover-notes", "Issued"], queryFn: () => api.get<{ coverNotes: CoverNote[] }>("/api/cover-notes?status=Issued") }).data?.coverNotes ?? [];
  const soon = inForce.filter((c) => (c.days_left ?? 99) <= 7).length;
  const metrics: Metric[] = [
    { key: "inforce", label: "In force", value: inForce.length },
    { key: "soon", label: "Expiring within 7 days", value: soon, tone: soon ? "warn" : "neutral" },
  ];
  const rows = data?.coverNotes ?? [];
  return (
    <div className="exec">
      <header className="exec-header">
        <div><span className="exec-eyebrow">Business & Sales</span><h1>Cover notes</h1></div>
        <div className="exec-meta"><span>Issued on a deal's Binding tab once the instruction to bind is approved.</span></div>
      </header>
      <MetricStrip metrics={metrics} label="Cover note summary" />
      <div className="exec-filters">
        <label className="exec-filter">
          <span>Show</span>
          <select value={view.id} onChange={(e) => { const next = new URLSearchParams(params); next.set("view", e.target.value); setParams(next, { replace: true }); }}>
            {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <section>
        {isLoading && <p className="exec-state">Loading…</p>}
        {error && <p className="exec-state">The register could not be loaded.</p>}
        {data && rows.length === 0 && <p className="exec-state">None.</p>}
        {rows.length > 0 && (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead><tr><th>Number</th><th>Client and deal</th><th>Lead insurer</th><th>Valid</th><th>Status</th><th><span className="sr-only">PDF</span></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>{c.cover_note_no}</td>
                    <td>{c.client_name}<div className="pl-hint"><Link to={`/deals/${c.deal_id}?tab=binding`}>{c.deal_name}</Link></div></td>
                    <td>{c.insurer_name}</td>
                    <td>{c.valid_from} to {c.valid_to}{c.days_left !== null && <div className="pl-hint">{c.days_left} day{c.days_left === 1 ? "" : "s"} left</div>}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><a className="btn-secondary btn btn-sm" href={apiUrl(`/api/cover-notes/${c.id}/pdf`)} target="_blank" rel="noreferrer">PDF</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
