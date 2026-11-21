import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Run, type SourceRun } from "../api";
import { useIsAdmin } from "../access";
import { Empty, ErrorNote, fmtDateTime, Loading, Pill, RunStatus } from "../components/ui";
import { confirmDialog } from "@/shared/components/Dialogs";

const duration = (r: Run) => {
  if (!r.finished_at) return "…";
  const s = Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export function RunsPage() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const runs = useQuery({
    queryKey: ["lead-portal", "runs"],
    queryFn: () => api.get<{ running: boolean; runs: Run[] }>("/runs"),
    refetchInterval: (q) => (q.state.data?.running || q.state.data?.runs.some((r) => r.status === "running") ? 3000 : false),
  });
  const start = useMutation({
    mutationFn: (mode: "collect" | "full") => api.post<{ runId: number }>("/runs", { mode }),
    onSuccess: (r) => {
      setExpanded(r.runId);
      qc.invalidateQueries({ queryKey: ["lead-portal", "runs"] });
    },
  });
  const list = runs.data?.runs;
  const running = runs.data?.running || list?.some((r) => r.status === "running");

  return (
    <div className="lp">
      <div className="page-header">
        <div>
          <p className="eyebrow">Lead Portal</p>
          <h1>Runs</h1>
          <p className="page-lede">Each run checks every enabled source and the watchlist. The daily scheduled run also sends the digest.</p>
        </div>
        {isAdmin ? (
          <div className="row gap">
            <button className="btn btn-secondary" disabled={start.isPending || running} onClick={() => start.mutate("collect")}>Collect now</button>
            <button className="btn" disabled={start.isPending || running} onClick={async () => (await confirmDialog("Collect, then email the digest?")) && start.mutate("full")}>
              Collect and send
            </button>
          </div>
        ) : null}
      </div>
      <ErrorNote error={start.error} />
      {running ? <div className="alert alert-info">A run is in progress. Sites are visited slowly on purpose (a few seconds apart), so a full run can take several minutes.</div> : null}

      <section className="card table-card">
        {runs.isLoading ? <Loading /> : !list?.length ? <Empty title="No runs yet" /> : (
          <table className="table clickable">
            <thead>
              <tr><th>#</th><th>Started</th><th>Trigger</th><th>Status</th><th className="num">Seen</th><th className="num">Relevant</th><th className="num">New</th><th>Digest</th><th>Took</th></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} className={expanded === r.id ? "selected" : ""}>
                    <td>{r.id}</td>
                    <td>{fmtDateTime(r.started_at)}</td>
                    <td>{r.trigger_type}{r.started_by ? <span className="muted small"> · {r.started_by}</span> : null}</td>
                    <td><RunStatus status={r.status} /></td>
                    <td className="num">{r.seen}</td>
                    <td className="num">{r.relevant}</td>
                    <td className="num">{r.new_leads}</td>
                    <td>{r.digest_id ? `#${r.digest_id}` : "—"}</td>
                    <td>{duration(r)}</td>
                  </tr>
                  {expanded === r.id ? (
                    <tr className="detail-row">
                      <td colSpan={9}><RunDetail run={r} /></td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function RunDetail({ run }: { run: Run }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-portal", "run", run.id, run.status],
    queryFn: () => api.get<Run & { sources: SourceRun[] }>(`/runs/${run.id}`),
  });
  if (isLoading || !data) return <Loading />;
  return (
    <div className="run-detail">
      {data.sources.length ? (
        <table className="table compact">
          <thead><tr><th>Source</th><th>Result</th><th className="num">Listings</th><th className="num">Kept</th><th>Error</th></tr></thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.id}>
                <td>{s.source}</td>
                <td>{s.ok ? <Pill tone="ok">OK</Pill> : <Pill tone="failed">Failed</Pill>}</td>
                <td className="num">{s.found}</td>
                <td className="num">{s.kept}</td>
                <td className="text-error small">{s.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No sources were checked in this run.</p>}
      {data.errors ? (
        <details>
          <summary>Messages ({data.errors.split("\n").length})</summary>
          <pre className="log">{data.errors}</pre>
        </details>
      ) : null}
    </div>
  );
}
