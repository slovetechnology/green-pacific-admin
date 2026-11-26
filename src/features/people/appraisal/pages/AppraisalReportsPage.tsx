import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import { fmtScore, type Adjustment, type Appeal, type AppraisalMeta } from "../lib/appraisalTypes";

interface Heatmap {
  departments: { department: string; n: number; hidden: boolean; kpi: number | null; competency: number | null; conduct: number | null; final: number | null }[];
  kpiHeat: { family: string; n: number; kpis: { code: string; name: string; n: number; median: number | null }[] }[];
  minGroup: number;
}

interface Distribution {
  n: number;
  bands: { band: number; label: string; count: number; actualPct: number; guidelinePct: number }[];
}

// Shades a 1-5 score for the heat map; the number is always shown too.
function HeatCell({ value, hidden }: { value: number | null; hidden?: boolean }) {
  if (hidden) return <span style={{ color: "var(--text-muted)" }}>Hidden</span>;
  if (value === null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const level = Math.max(1, Math.min(5, Math.round(value)));
  return <span className={`heat heat-${level}`}>{fmtScore(value)}</span>;
}

// HR and the MD: a cycle's heat map, distribution and the compensation
// export for Finance.
export function AppraisalReportsPage() {
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const annual = meta.data?.cycles.filter((c) => c.cycle_type === "annual") ?? [];
  const [picked, setPicked] = useState("");
  const cycleId = picked || (annual[0] ? String(annual[0].id) : "");
  const heat = useQuery({
    queryKey: ["appraisal", "heatmap", cycleId],
    queryFn: () => api.get<Heatmap>(`/api/appraisal/reports/heatmap?cycle_id=${cycleId}`),
    enabled: Boolean(cycleId),
  });
  const dist = useQuery({
    queryKey: ["appraisal", "distribution", cycleId],
    queryFn: () => api.get<Distribution>(`/api/appraisal/reports/distribution?cycle_id=${cycleId}`),
    enabled: Boolean(cycleId),
  });

  return (
    <div>
      <div className="page-header">
        <h1>Appraisal reports</h1>
        <div className="page-header-actions">
          {cycleId && <a className="btn" href={apiUrl(`/api/appraisal/reports/compensation.xlsx?cycle_id=${cycleId}`)}>Download compensation export (.xlsx)</a>}
        </div>
      </div>
      <div className="toolbar">
        <select value={cycleId} onChange={(e) => setPicked(e.target.value)} aria-label="Cycle">
          {annual.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {!cycleId && <div className="card">No annual cycles yet.</div>}

      {heat.data && (
        <div className="card">
          <h2>Department heat map</h2>
          <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Median scores of appraisals HR has approved. Groups of fewer than {heat.data.minGroup} people are hidden, so no cell identifies a person.
          </p>
          <DataGrid
            columns={[
              { key: "d", header: "Department", render: (r) => r.department },
              { key: "n", header: "People", align: "right", render: (r) => r.n },
              { key: "kpi", header: "KPIs", align: "right", render: (r) => <HeatCell value={r.kpi} hidden={r.hidden} /> },
              { key: "comp", header: "Competencies", align: "right", render: (r) => <HeatCell value={r.competency} hidden={r.hidden} /> },
              { key: "conduct", header: "Conduct", align: "right", render: (r) => <HeatCell value={r.conduct} hidden={r.hidden} /> },
              { key: "final", header: "Final", align: "right", render: (r) => <HeatCell value={r.final} hidden={r.hidden} /> },
            ]}
            rows={heat.data.departments}
            isLoading={false}
            getRowKey={(r) => r.department}
            emptyMessage="No approved appraisals in this cycle yet."
          />
        </div>
      )}

      {heat.data?.kpiHeat.map((f) => (
        <div className="card" key={f.family}>
          <h2>{f.family}: KPI medians ({f.n} people)</h2>
          <div className="heat-kpis">
            {f.kpis.map((k) => (
              <div key={k.code} className="heat-kpi">
                <span>{k.name}</span>
                <HeatCell value={k.median} hidden={k.median === null && k.n > 0 && k.n < (heat.data?.minGroup ?? 3)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <TrendCard />
      <AttritionCard />
      <UptimeCard />

      {dist.data && (
        <div className="card">
          <h2>Distribution ({dist.data.n} people)</h2>
          <DataGrid
            columns={[
              { key: "b", header: "Band", render: (b) => `${b.band} · ${b.label}` },
              { key: "c", header: "People", align: "right", render: (b) => b.count },
              { key: "a", header: "Actual", align: "right", render: (b) => `${b.actualPct}%` },
              { key: "g", header: "Guideline", align: "right", render: (b) => `${b.guidelinePct}%` },
            ]}
            rows={dist.data.bands}
            isLoading={false}
            getRowKey={(b) => b.band}
          />
        </div>
      )}
    </div>
  );
}

function TrendCard() {
  const { data } = useQuery({
    queryKey: ["appraisal", "trend"],
    queryFn: () => api.get<{ cycles: { id: number; name: string }[]; departments: { department: string; medians: (number | null)[] }[]; minGroup: number }>("/api/appraisal/reports/trend"),
  });
  if (!data || data.cycles.length === 0) return null;
  return (
    <div className="card">
      <h2>Year on year: median final score by department</h2>
      <div className="table-wrap">
        <table className="data-grid-table">
          <thead>
            <tr>
              <th>Department</th>
              {data.cycles.map((c) => <th key={c.id} className="num">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.departments.map((d) => (
              <tr key={d.department}>
                <td>{d.department}</td>
                {d.medians.map((m, i) => <td key={i} className="num"><HeatCell value={m} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 0 }}>A dash means fewer than {data.minGroup} scored people, or none.</p>
    </div>
  );
}

function AttritionCard() {
  const { data } = useQuery({
    queryKey: ["appraisal", "attrition"],
    queryFn: () => api.get<{ people: { id: number; full_name: string; department_name: string; job_title: string | null; last_band: number | null; reasons: string[] }[] }>("/api/appraisal/reports/attrition-risk"),
  });
  if (!data) return null;
  return (
    <div className="card">
      <h2>Attrition risk</h2>
      <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Fixed rules, not a prediction: two strong ratings with no change of role, a fall of two bands, disagreement after a change of manager,
        an active improvement plan, or an extended probation. For HR and the MD only.
      </p>
      <DataGrid
        columns={[
          { key: "n", header: "Employee", render: (p) => <Link to={`/org/employees/${p.id}`}>{p.full_name}</Link> },
          { key: "d", header: "Department", render: (p) => p.department_name },
          { key: "b", header: "Last band", align: "right", render: (p) => p.last_band ?? "—" },
          { key: "r", header: "Why", render: (p) => p.reasons.join("; ") },
        ]}
        rows={data.people}
        isLoading={false}
        getRowKey={(p) => p.id}
        emptyMessage="Nobody meets the rules."
      />
    </div>
  );
}

function UptimeCard() {
  const { data } = useQuery({
    queryKey: ["appraisal", "uptime"],
    queryFn: () => api.get<{ from: string; to: string; value: number | null; slots: number; up: number; since: string | null; outages: { from: string; to: string; minutes: number }[] }>("/api/appraisal/reports/uptime"),
  });
  if (!data) return null;
  return (
    <div className="card">
      <h2>ERP availability, last 30 days</h2>
      {data.value === null ? (
        <p style={{ margin: 0 }}>No heartbeats recorded yet. They start when the backend runs as a server.</p>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{data.value}%</strong> of business hours ({data.up} of {data.slots} five-minute slots, Mon-Fri 08:00-18:00 WAT), measured
            since {data.since?.slice(0, 10)}.
          </p>
          {data.outages.length > 0 && (
            <ul style={{ margin: 0 }}>
              {data.outages.slice(-10).map((o) => (
                <li key={o.from}>{o.from} to {o.to} UTC: {o.minutes} minutes</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// Appeals waiting for a decision this user may make, and (for HR) pending
// KPI adjustment requests. Decisions are made on each appraisal's page.
export function AppraisalQueuesPage() {
  const appeals = useQuery({ queryKey: ["appraisal", "appeals"], queryFn: () => api.get<{ appeals: Appeal[] }>("/api/appraisal/appeals") });
  const adjustments = useQuery({
    queryKey: ["appraisal", "adjustments"],
    queryFn: () => api.get<{ adjustments: Adjustment[] }>("/api/appraisal/adjustments"),
    retry: false,
  });
  return (
    <div>
      <div className="page-header">
        <h1>Appeals and adjustments</h1>
      </div>
      <div className="card">
        <h2>Appeals waiting for your decision</h2>
        <DataGrid
          columns={[
            { key: "who", header: "Employee", render: (a) => <Link to={`/appraisal/${a.appraisal_id}`}>{a.full_name}</Link> },
            { key: "cycle", header: "Cycle", render: (a) => a.cycle_name },
            { key: "grounds", header: "Grounds", render: (a) => a.grounds },
            { key: "filed", header: "Filed", render: (a) => a.filed_at.slice(0, 10) },
          ]}
          rows={appeals.data?.appeals}
          isLoading={appeals.isLoading}
          getRowKey={(a) => a.id}
          emptyMessage="No appeals are waiting for you."
        />
      </div>
      {adjustments.data && (
        <div className="card">
          <h2>KPI adjustment requests</h2>
          <DataGrid
            columns={[
              { key: "who", header: "Employee", render: (a) => <Link to={`/appraisal/${a.appraisal_id}`}>{a.full_name}</Link> },
              { key: "kpi", header: "KPI", render: (a) => a.kpi_name },
              { key: "change", header: "Change", render: (a) => `${a.original_value ?? "—"} → ${a.proposed_value} ${a.unit}` },
              { key: "why", header: "Reason", render: (a) => a.reason },
              { key: "by", header: "Asked by", render: (a) => a.requested_by },
            ]}
            rows={adjustments.data.adjustments}
            isLoading={false}
            getRowKey={(a) => a.id}
            emptyMessage="No pending adjustment requests."
          />
        </div>
      )}
    </div>
  );
}
