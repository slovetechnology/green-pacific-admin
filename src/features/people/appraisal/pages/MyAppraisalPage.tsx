import { Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import { STATUS_BADGE, fmtScore, type AppraisalListRow } from "../lib/appraisalTypes";

// The employee's own appraisals. With exactly one open appraisal it goes
// straight to it.
export function MyAppraisalPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["appraisals", "mine"],
    queryFn: () => api.get<{ appraisals: AppraisalListRow[]; hasEmployeeRecord: boolean }>("/api/appraisal/appraisals/mine"),
  });
  if (isLoading || !data) return <div className="card">Loading…</div>;
  const open = data.appraisals.filter((a) => a.status !== "Closed");
  if (open.length === 1 && data.appraisals.length === 1) return <Navigate to={`/appraisal/${open[0].id}`} replace />;

  return (
    <div>
      <div className="page-header">
        <h1>My appraisal</h1>
      </div>
      {!data.hasEmployeeRecord ? (
        <div className="card">Your login isn't linked to an employee record yet, so there's no appraisal to show. Ask HR to link it.</div>
      ) : (
        <DataGrid
          columns={[
            { key: "cycle", header: "Cycle", render: (a) => <Link to={`/appraisal/${a.id}`}>{a.cycle_name}</Link> },
            { key: "status", header: "Stage", render: (a) => <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span> },
            { key: "reviewer", header: "Reviewer", render: (a) => a.reviewer_username || "—" },
            { key: "final", header: "Final score", align: "right", render: (a) => fmtScore(a.final_overall) },
          ]}
          rows={data.appraisals}
          isLoading={false}
          getRowKey={(a) => a.id}
          emptyMessage="You don't have an appraisal yet. One is created when HR launches a cycle."
        />
      )}
    </div>
  );
}

// Appraisals the user reviews, plus everyone below them in the org chart.
export function TeamAppraisalsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["appraisals", "team"],
    queryFn: () => api.get<{ appraisals: AppraisalListRow[] }>("/api/appraisal/appraisals/team"),
  });
  return (
    <div>
      <div className="page-header">
        <h1>My team's appraisals</h1>
      </div>
      <DataGrid
        columns={[
          { key: "name", header: "Employee", render: (a) => <Link to={`/appraisal/${a.id}`}>{a.full_name}</Link> },
          { key: "title", header: "Job title", render: (a) => a.job_title || "—" },
          { key: "dept", header: "Department", render: (a) => a.department_name },
          { key: "cycle", header: "Cycle", render: (a) => a.cycle_name },
          { key: "status", header: "Stage", render: (a) => <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span> },
          { key: "reviewer", header: "Reviewer", render: (a) => a.reviewer_username || "Not assigned" },
          { key: "final", header: "Score", align: "right", render: (a) => fmtScore(a.final_overall) },
        ]}
        rows={data?.appraisals}
        isLoading={isLoading}
        getRowKey={(a) => a.id}
        emptyMessage="Nobody reports to you, and you aren't reviewing anyone's appraisal."
      />
    </div>
  );
}
