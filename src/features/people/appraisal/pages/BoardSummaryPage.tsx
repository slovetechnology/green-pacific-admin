import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import { fmtScore, type AppraisalMeta } from "../lib/appraisalTypes";

interface Board {
  cycle: { id: number; name: string; period_start: string; period_end: string; status: string };
  appraised: number;
  closed: number;
  completionPct: number;
  byStatus: Record<string, number>;
  distribution: { band: number; label: string; count: number; guidelinePct: number }[];
  calibrated: number;
  confirmedFlags: Record<string, number>;
  appeals: Record<string, number>;
  activePips: number;
  departments: { department: string; n: number; median: number | null }[];
  minGroup: number;
}

// Aggregates only, for the board: no individual appears anywhere.
export function BoardSummaryPage() {
  const cycles = useQuery({ queryKey: ["appraisal", "board", "cycles"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const annual = cycles.data?.cycles.filter((c) => c.cycle_type === "annual") ?? [];
  const [picked, setPicked] = useState("");
  const cycleId = picked || (annual[0] ? String(annual[0].id) : "");
  const { data } = useQuery({
    queryKey: ["appraisal", "board", cycleId],
    queryFn: () => api.get<Board>(`/api/appraisal/reports/board-summary?cycle_id=${cycleId}`),
    enabled: Boolean(cycleId),
  });

  return (
    <div>
      <div className="page-header">
        <h1>Board summary</h1>
      </div>
      {annual.length > 0 && (
        <div className="toolbar">
          <select value={cycleId} onChange={(e) => setPicked(e.target.value)} aria-label="Cycle">
            {annual.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {!cycleId && <div className="card">No annual cycles yet.</div>}
      {data && (
        <>
          <div className="card">
            <div className="detail-grid">
              <div><div className="k">Staff appraised</div><div className="v">{data.appraised}</div></div>
              <div><div className="k">Completed</div><div className="v">{data.closed} ({data.completionPct}%)</div></div>
              <div><div className="k">Scores calibrated</div><div className="v">{data.calibrated}</div></div>
              <div><div className="k">Active improvement plans</div><div className="v">{data.activePips}</div></div>
            </div>
          </div>
          <div className="card">
            <h2>Rating distribution</h2>
            <DataGrid
              columns={[
                { key: "b", header: "Band", render: (b) => `${b.band} · ${b.label}` },
                { key: "c", header: "Staff", align: "right", render: (b) => b.count },
                { key: "g", header: "Guideline", align: "right", render: (b) => `${b.guidelinePct}%` },
              ]}
              rows={data.distribution}
              isLoading={false}
              getRowKey={(b) => b.band}
            />
          </div>
          <div className="card">
            <h2>Conduct and appeals</h2>
            <div className="detail-grid">
              {Object.entries(data.confirmedFlags).map(([sev, n]) => (
                <div key={sev}><div className="k">{sev} flags confirmed</div><div className="v">{n}</div></div>
              ))}
              {Object.entries(data.appeals).map(([outcome, n]) => (
                <div key={outcome}><div className="k">Appeals {outcome.toLowerCase()}</div><div className="v">{n}</div></div>
              ))}
              {!Object.keys(data.appeals).length && <div><div className="k">Appeals</div><div className="v">None</div></div>}
            </div>
          </div>
          <div className="card">
            <h2>Median final score by department</h2>
            <DataGrid
              columns={[
                { key: "d", header: "Department", render: (d) => d.department },
                { key: "n", header: "Scored", align: "right", render: (d) => d.n },
                { key: "m", header: "Median", align: "right", render: (d) => (d.median === null ? `Hidden (under ${data.minGroup})` : fmtScore(d.median)) },
              ]}
              rows={data.departments}
              isLoading={false}
              getRowKey={(d) => d.department}
              emptyMessage="No scored appraisals yet."
            />
          </div>
        </>
      )}
    </div>
  );
}
