import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { api, qs, type Lead } from "../api";
import { useCanWorkLeads } from "../access";
import { ConvertToDealDialog } from "../components/ConvertToDealDialog";
import { ContactList, Empty, ErrorNote, FamilyTag, fmtDate, fmtDateTime, Loading, ScoreBadge, timeAgo } from "../components/ui";

interface LeadPage {
  total: number;
  page: number;
  pageSize: number;
  leads: Lead[];
}

const FILTER_KEYS = ["q", "sector", "family", "status", "sent", "converted", "minScore", "sinceHours", "page"] as const;

export function LeadsPage() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""])) as Record<(typeof FILTER_KEYS)[number], string>;
  const selected = Number(params.get("selected")) || null;
  const [search, setSearch] = useState(filters.q);

  const meta = useQuery({ queryKey: ["lead-portal", "meta"], queryFn: () => api.get<{ sectors: string[] }>("/meta"), staleTime: Infinity });
  const { data, isLoading, error } = useQuery({
    queryKey: ["lead-portal", "leads", filters],
    queryFn: () => api.get<LeadPage>(`/leads${qs({ ...filters, pageSize: 50 })}`),
    placeholderData: (prev) => prev,
  });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page" && key !== "selected") next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => search !== filters.q && set("q", search.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = Number(filters.page) || 1;

  return (
    <div className={`lp${selected ? " with-panel" : ""}`}>
      <div className="page-header">
        <div>
          <p className="eyebrow">Lead Portal</p>
          <h1>Leads</h1>
          <p className="page-lede">Every tender and intent signal the engine has kept. Shortlist the ones worth chasing and add them to the pipeline; dismissed leads never go in a digest.</p>
        </div>
      </div>

      <div className="filters card">
        <input type="search" placeholder="Search company, title or reference" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <select value={filters.sector} onChange={(e) => set("sector", e.target.value)} aria-label="Sector">
          <option value="">All sectors</option>
          {meta.data?.sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.family} onChange={(e) => set("family", e.target.value)} aria-label="Source type">
          <option value="">All sources</option>
          <option value="tender">Tenders</option>
          <option value="institutional">Institutional</option>
          <option value="intent">Intent signals</option>
          <option value="mock">Mock</option>
        </select>
        <select value={filters.status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="new">New</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select value={filters.sent} onChange={(e) => set("sent", e.target.value)} aria-label="Sent">
          <option value="">Sent or not</option>
          <option value="no">Not yet sent</option>
          <option value="yes">Already sent</option>
        </select>
        <select value={filters.converted} onChange={(e) => set("converted", e.target.value)} aria-label="In the pipeline">
          <option value="">In pipeline or not</option>
          <option value="yes">In the pipeline</option>
          <option value="no">Not in the pipeline</option>
        </select>
        <select value={filters.sinceHours} onChange={(e) => set("sinceHours", e.target.value)} aria-label="Found within">
          <option value="">Any time</option>
          <option value="24">Last 24 hours</option>
          <option value="168">Last 7 days</option>
          <option value="720">Last 30 days</option>
        </select>
        <select value={filters.minScore} onChange={(e) => set("minScore", e.target.value)} aria-label="Minimum score">
          <option value="">Any score</option>
          <option value="25">25+</option>
          <option value="45">45+</option>
          <option value="70">70+</option>
        </select>
      </div>

      <div className="leads-layout">
        <section className="card table-card">
          <ErrorNote error={error} />
          {isLoading ? <Loading /> : !data?.leads.length ? (
            <Empty title="No leads match">Try clearing a filter, or start a run from the Runs page.</Empty>
          ) : (
            <>
              <table className="table clickable">
                <thead>
                  <tr><th className="num">Score</th><th>Company</th><th>Opportunity</th><th>Sector</th><th>Source</th><th>Found</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.leads.map((l) => (
                    <tr key={l.id} className={l.id === selected ? "selected" : ""} onClick={() => set("selected", String(l.id))}>
                      <td className="num"><ScoreBadge score={l.score} /></td>
                      <td><strong>{l.company}</strong>{l.sentAt ? <span className="tag tag-sent">sent</span> : null}{l.dealId ? <span className="tag tag-deal">in pipeline</span> : null}</td>
                      <td className="clip" title={l.title}>{l.title}</td>
                      <td>{l.sector}</td>
                      <td><FamilyTag family={l.sourceFamily} /></td>
                      <td className="nowrap" title={fmtDateTime(l.discoveredAt)}>{timeAgo(l.discoveredAt)}</td>
                      <td><span className={`status status-${l.status}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <footer className="pager">
                <span className="muted">{data.total.toLocaleString()} leads</span>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</button>
              </footer>
            </>
          )}
        </section>
        {selected ? <LeadPanel id={selected} onClose={() => set("selected", "")} /> : null}
      </div>
    </div>
  );
}

function LeadPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const canWork = useCanWorkLeads();
  const [converting, setConverting] = useState(false);
  const { data: lead, isLoading, error } = useQuery({ queryKey: ["lead-portal", "lead", id], queryFn: () => api.get<Lead>(`/leads/${id}`) });
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(lead?.notes || ""), [lead?.id, lead?.notes]);

  const update = useMutation({
    mutationFn: (body: Partial<Pick<Lead, "status" | "notes">>) => api.patch<Lead>(`/leads/${id}`, body),
    onSuccess: (l) => {
      qc.setQueryData(["lead-portal", "lead", id], l);
      qc.invalidateQueries({ queryKey: ["lead-portal", "leads"] });
      qc.invalidateQueries({ queryKey: ["lead-portal", "dashboard"] });
    },
  });

  return (
    <aside className="card panel" aria-label="Lead detail">
      <header className="panel-head">
        <h2>{lead?.company || "Lead"}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </header>
      {isLoading ? <Loading /> : error || !lead ? <ErrorNote error={error} /> : (
        <div className="panel-body">
          <div className="row gap">
            <ScoreBadge score={lead.score} /> <FamilyTag family={lead.sourceFamily} />
            {lead.sentAt ? <span className="tag tag-sent">sent {fmtDate(lead.sentAt)}</span> : null}
          </div>
          <p className="lead-title">{lead.url ? <a href={lead.url} target="_blank" rel="noreferrer noopener">{lead.title}</a> : lead.title}</p>

          <dl className="facts">
            <dt>Source</dt><dd>{lead.sourceLabel}</dd>
            <dt>Sector</dt><dd>{lead.sector}</dd>
            <dt>Opportunity</dt><dd>{lead.riskCategory}</dd>
            {lead.matchedKeywords.length ? <><dt>Keywords</dt><dd>{lead.matchedKeywords.join(", ")}</dd></> : null}
            {lead.trigger ? <><dt>Trigger</dt><dd>{lead.trigger}</dd></> : null}
            {lead.deadline ? <><dt>Deadline</dt><dd className="text-warn">{lead.deadline}</dd></> : null}
            <dt>Published</dt><dd>{fmtDate(lead.publishedAt)}</dd>
            <dt>First seen</dt><dd>{fmtDateTime(lead.discoveredAt)}</dd>
            {lead.domain ? <><dt>Website</dt><dd><a href={`https://${lead.domain}`} target="_blank" rel="noreferrer noopener">{lead.domain}</a></dd></> : null}
          </dl>

          <h3>Contacts</h3>
          <ContactList contacts={lead.contacts} />

          <h3>Outreach angle</h3>
          <p className="angle">{lead.recommendation}</p>

          {lead.summary ? (
            <>
              <h3>Listing text</h3>
              <p className="summary">{lead.summary}</p>
            </>
          ) : null}

          <h3>Sales pipeline</h3>
          {lead.dealId ? (
            <p style={{ margin: 0 }}>
              <Link to={`/deals/${lead.dealId}`}>Deal #{lead.dealId}</Link>
              <span className="muted small"> · added by {lead.convertedBy} {lead.convertedAt ? fmtDate(lead.convertedAt) : ""}</span>
            </p>
          ) : canWork ? (
            <button className="btn btn-sm" onClick={() => setConverting(true)}>Add to pipeline</button>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Not in the pipeline yet.</p>
          )}

          <h3>Status</h3>
          {canWork ? (
            <div className="row gap">
              {(["new", "shortlisted", "dismissed"] as const).map((s) => (
                <button key={s} className={`btn btn-sm${lead.status === s ? "" : " btn-secondary"}`} disabled={update.isPending} onClick={() => update.mutate({ status: s })}>
                  {s === "new" ? "New" : s === "shortlisted" ? "Shortlist" : "Dismiss"}
                </button>
              ))}
            </div>
          ) : (
            <span className={`status status-${lead.status}`}>{lead.status}</span>
          )}

          <h3>Notes</h3>
          {canWork ? (
            <>
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who's calling them, what was said…" />
              <div className="row gap" style={{ marginTop: 8 }}>
                <button className="btn btn-sm" disabled={update.isPending || notes === (lead.notes || "")} onClick={() => update.mutate({ notes })}>Save notes</button>
                <ErrorNote error={update.error} />
              </div>
            </>
          ) : (
            <p className="summary">{lead.notes || "No notes."}</p>
          )}
          {converting ? (
            <ConvertToDealDialog
              lead={lead}
              onClose={() => setConverting(false)}
              onDone={() => {
                setConverting(false);
                qc.invalidateQueries({ queryKey: ["lead-portal"] });
              }}
            />
          ) : null}
        </div>
      )}
    </aside>
  );
}
