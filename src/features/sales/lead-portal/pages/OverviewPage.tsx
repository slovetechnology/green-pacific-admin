import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, type Dashboard } from "../api";
import { ContactList, Empty, ErrorNote, FamilyTag, Loading, Pill, RunStatus, ScoreBadge, timeAgo } from "../components/ui";

export function OverviewPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "dashboard"], queryFn: () => api.get<Dashboard>("/dashboard"), refetchInterval: 60_000 });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;
  const { counts, lastRun, lastDigest, nextDigest, settings, sources, bySector } = data;
  const maxSector = Math.max(1, ...bySector.map((s) => s.n));

  return (
    <div className="lp">
      <div className="page-header">
        <div>
          <p className="eyebrow">Lead Portal</p>
          <h1>Overview</h1>
          <p className="page-lede">
            {settings.dailyRun ? (
              <>The digest goes out daily at <strong>{settings.sendTime}</strong> ({settings.timeZone}) with up to {settings.digestSize} leads.</>
            ) : (
              <>The daily run is switched off (Setup); runs and digests start by hand.</>
            )}
            {data.running ? <> <Pill tone="running">Run in progress</Pill></> : null}
          </p>
        </div>
      </div>

      <section className="kpis">
        <Kpi label="New leads (24 h)" value={counts.leads_24h} />
        <Kpi label="Shortlisted" value={counts.shortlisted} />
        <Kpi label="In the pipeline" value={counts.converted} />
        <Kpi label="Companies sent" value={counts.companies_sent} hint="never sent twice" />
        <Kpi label="Digests sent" value={counts.digests_sent} />
        <Kpi label="Leads stored" value={counts.leads_total} />
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h2>Next digest</h2>
            <Link to="/lead-portal/digests" className="btn btn-secondary btn-sm">Preview email</Link>
          </header>
          {nextDigest.length === 0 ? (
            <Empty title="Nothing queued yet">New qualifying leads from the last 24 hours that haven't been sent will appear here.</Empty>
          ) : (
            <ol className="next-list">
              {nextDigest.map((l) => (
                <li key={l.id}>
                  <ScoreBadge score={l.score} />
                  <div className="next-main">
                    <div className="next-title">
                      <Link to={`/lead-portal/leads?selected=${l.id}`}>{l.company}</Link> <FamilyTag family={l.sourceFamily} />
                    </div>
                    <div className="muted small">{l.riskCategory} · {l.sourceLabel}</div>
                    <ContactList contacts={l.contacts.slice(0, 2)} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <header className="card-head"><h2>Last run</h2><Link to="/lead-portal/runs" className="btn btn-secondary btn-sm">All runs</Link></header>
            {lastRun ? (
              <dl className="facts">
                <dt>Status</dt><dd><RunStatus status={lastRun.status} /> {timeAgo(lastRun.started_at)}</dd>
                <dt>Listings seen</dt><dd>{lastRun.seen}</dd>
                <dt>Relevant</dt><dd>{lastRun.relevant}</dd>
                <dt>New leads</dt><dd>{lastRun.new_leads}</dd>
              </dl>
            ) : <Empty title="No runs yet">An admin can start one on the Runs page.</Empty>}
          </section>

          <section className="card">
            <header className="card-head"><h2>Last digest</h2></header>
            {lastDigest ? (
              <dl className="facts">
                <dt>Status</dt><dd><Pill tone={lastDigest.status === "sent" ? "ok" : lastDigest.status === "failed" ? "failed" : "muted"}>{lastDigest.status}</Pill> {timeAgo(lastDigest.sent_at)}</dd>
                <dt>Leads</dt><dd>{lastDigest.lead_count}</dd>
                {lastDigest.error ? <><dt>Error</dt><dd className="text-error">{lastDigest.error}</dd></> : null}
              </dl>
            ) : <Empty title="No digest sent yet" />}
          </section>

          <section className="card">
            <header className="card-head"><h2>Source health</h2><Link to="/lead-portal/setup?tab=sources" className="btn btn-secondary btn-sm">Sources</Link></header>
            {sources.length === 0 ? <Empty title="No source has run yet" /> : (
              <table className="table compact">
                <thead><tr><th>Source</th><th>Last result</th><th className="num">Found</th><th className="num">Kept</th></tr></thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source} title={s.error || ""}>
                      <td>{s.source}</td>
                      <td>{s.ok ? <Pill tone="ok">OK</Pill> : <Pill tone="failed">Failed</Pill>} <span className="muted small">{timeAgo(s.ran_at)}</span></td>
                      <td className="num">{s.found}</td>
                      <td className="num">{s.kept}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {bySector.length ? (
            <section className="card">
              <header className="card-head"><h2>Leads by sector (30 days)</h2></header>
              <div className="bars">
                {bySector.map((s) => (
                  <div key={s.sector} className="bar-row">
                    <span>{s.sector || "Unclassified"}</span>
                    <div className="bar"><div style={{ width: `${(s.n / maxSector) * 100}%` }} /></div>
                    <span className="num">{s.n}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="kpi card">
      <span className="kpi-value">{value.toLocaleString()}</span>
      <span className="kpi-label">{label}</span>
      {hint ? <span className="muted small">{hint}</span> : null}
    </div>
  );
}
