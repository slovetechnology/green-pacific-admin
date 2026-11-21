import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, type Keyword, type Lead, type Settings, type Source, type WatchedCompany } from "../api";
import { useIsAdmin } from "../access";
import { Empty, ErrorNote, Loading, Modal, Pill, ScoreBadge, timeAgo } from "../components/ui";
import { alertDialog, confirmDialog } from "@/shared/components/Dialogs";

const TABS = [
  { id: "digest", label: "Digest" },
  { id: "sources", label: "Sources" },
  { id: "keywords", label: "Keywords" },
  { id: "watchlist", label: "Watchlist" },
];

export function SetupPage() {
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "digest";
  return (
    <div className="lp">
      <div className="page-header">
        <div>
          <p className="eyebrow">Lead Portal</p>
          <h1>Setup</h1>
          <p className="page-lede">{isAdmin ? "Changes apply from the next run. Who can use the portal follows ERP roles: admins change the setup, editors work leads, viewers read." : "Read only: ask an admin to change these."}</p>
        </div>
        {isAdmin ? <LoadDefaults /> : null}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setParams({ tab: t.id }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "digest" && <DigestSettings />}
      {tab === "sources" && <Sources />}
      {tab === "keywords" && <Keywords />}
      {tab === "watchlist" && <Watchlist />}
    </div>
  );
}

// Puts back any of the starter sources, keywords and watchlist companies that are missing. Existing rows are left alone.
function LoadDefaults() {
  const qc = useQueryClient();
  const load = useMutation({
    mutationFn: () => api.post<{ sources: number; keywords: number; watchlist: number }>("/defaults", {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lead-portal"] });
      void alertDialog(r.sources + r.keywords + r.watchlist
        ? `Added ${r.watchlist} watchlist companies, ${r.keywords} keywords and ${r.sources} sources.`
        : "Nothing was missing: the default list is already loaded.");
    },
    onError: (e) => alertDialog(e instanceof Error ? e.message : "Could not load the default list"),
  });
  return (
    <button className="btn btn-secondary" disabled={load.isPending} title="Adds the 14 starter companies, the 7 keywords and the 6 tender sources if any are missing"
      onClick={() => load.mutate()}>
      {load.isPending ? "Loading…" : "Load the default list"}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="lp-field">
      <span>{label}</span>
      {children}
      {hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

// ------------------------------------------------------------------------------------ digest

function DigestSettings() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "settings"], queryFn: () => api.get<Settings>("/settings") });
  const [form, setForm] = useState<Partial<Settings>>({});
  const save = useMutation({
    mutationFn: (body: Partial<Settings>) => api.put<Settings>("/settings", body),
    onSuccess: () => {
      setForm({});
      qc.invalidateQueries({ queryKey: ["lead-portal", "settings"] });
      qc.invalidateQueries({ queryKey: ["lead-portal", "dashboard"] });
    },
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;
  const v = { ...data, ...form };
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k: keyof Settings) => (e: { target: { checked: boolean } }) => setForm((f) => ({ ...f, [k]: e.target.checked ? "1" : "0" }));
  const providers = v.intent_providers.split(",").filter(Boolean);
  const toggleProvider = (p: string, on: boolean) =>
    setForm((f) => ({ ...f, intent_providers: (on ? [...providers, p] : providers.filter((x) => x !== p)).join(",") }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <form className="card form" onSubmit={submit}>
      <fieldset disabled={!isAdmin}>
        <div className="lp-form-grid">
          <Field label="Recipients" hint="Comma-separated email addresses">
            <input value={v.digest_recipients} onChange={set("digest_recipients")} />
          </Field>
          <Field label="Send time" hint={`Daily, ${v.timezone}`}>
            <input type="time" value={v.send_time} onChange={set("send_time")} />
          </Field>
          <Field label="Time zone">
            <input value={v.timezone} onChange={set("timezone")} />
          </Field>
          <Field label="Leads per digest">
            <input type="number" min={1} max={50} value={v.digest_size} onChange={set("digest_size")} />
          </Field>
          <Field label="Window (hours)" hint="Leads first seen within this window qualify">
            <input type="number" min={1} max={168} value={v.digest_window_hours} onChange={set("digest_window_hours")} />
          </Field>
          <Field label="Minimum score" hint="0-100; weaker leads are kept but never emailed">
            <input type="number" min={0} max={100} value={v.min_score} onChange={set("min_score")} />
          </Field>
        </div>

        <div className="checks" style={{ marginTop: 12 }}>
          <label className="check"><input type="checkbox" checked={v.daily_run === "1"} onChange={toggle("daily_run")} /> Collect and send the digest automatically every day at the send time</label>
        </div>

        <h3>Intent signals</h3>
        <div className="checks">
          <label className="check"><input type="checkbox" checked={providers.includes("news_rss")} onChange={(e) => toggleProvider("news_rss", e.target.checked)} /> Public news (Google News RSS)</label>
          <label className="check"><input type="checkbox" checked={providers.includes("licensed")} onChange={(e) => toggleProvider("licensed", e.target.checked)} /> Licensed signals API</label>
          <label className="check"><input type="checkbox" checked={providers.includes("linkedin")} onChange={(e) => toggleProvider("linkedin", e.target.checked)} /> LinkedIn (licensed API only)</label>
          <label className="check"><input type="checkbox" checked={providers.includes("mock")} onChange={(e) => toggleProvider("mock", e.target.checked)} /> Mock data (demos only)</label>
        </div>
        <p className="muted small">LinkedIn pages are never scraped: their terms forbid it. LinkedIn and licensed signals need INTENT_API_URL set on the server.</p>

        <h3>Contacts and sending</h3>
        <div className="checks">
          <label className="check"><input type="checkbox" checked={v.check_mx === "1"} onChange={toggle("check_mx")} /> Check that email domains accept mail (drop dead ones)</label>
          <label className="check"><input type="checkbox" checked={v.crawl_contact_pages === "1"} onChange={toggle("crawl_contact_pages")} /> Read company websites' contact pages</label>
          <label className="check"><input type="checkbox" checked={v.send_empty_digest === "1"} onChange={toggle("send_empty_digest")} /> Send a digest even when there are no new leads</label>
        </div>

        <p className="muted small">
          Email is sent from <strong>{data.emailFrom}</strong>{" "}
          {data.emailConfigured ? <Pill tone="ok">Sending via Resend</Pill> : <Pill tone="failed">Email not set up</Pill>}
        </p>
      </fieldset>
      <ErrorNote error={save.error} />
      {save.isSuccess ? <div className="alert alert-success">Saved.</div> : null}
      {isAdmin ? <button className="btn" disabled={!Object.keys(form).length || save.isPending}>Save settings</button> : null}
    </form>
  );
}

// ------------------------------------------------------------------------------------ sources

function Sources() {
  const isAdmin = useIsAdmin();
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "sources"], queryFn: () => api.get<Source[]>("/sources") });
  const [editing, setEditing] = useState<Source | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;
  return (
    <section className="card table-card">
      <div className="alert alert-info">
        Each portal is read using CSS selectors. Check them against the live site with <strong>Test</strong> before relying on a source: a
        portal that changes its layout shows up here as "0 listings".
      </div>
      <table className="table">
        <thead><tr><th>Source</th><th>Type</th><th>Fetch</th><th>Last run</th><th>Enabled</th><th /></tr></thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong><div className="muted small clip">{s.url}</div>{s.notes ? <div className="small text-warn">{s.notes}</div> : null}</td>
              <td>{s.family}</td>
              <td>{s.kind === "worldbank_api" ? "API" : s.kind === "playwright" ? "Browser" : "HTML"}</td>
              <td>
                {s.lastRun ? (
                  <span title={s.lastRun.error || ""}>
                    {s.lastRun.ok ? <Pill tone="ok">OK</Pill> : <Pill tone="failed">Failed</Pill>} {s.lastRun.found} listings · {timeAgo(s.lastRun.ran_at)}
                  </span>
                ) : <span className="muted">never</span>}
              </td>
              <td>{s.enabled ? <Pill tone="ok">On</Pill> : <Pill tone="muted">Off</Pill>}</td>
              <td className="right"><button className="btn btn-secondary btn-sm" onClick={() => setEditing(s)}>{isAdmin ? "Edit / Test" : "View"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? <SourceEditor source={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

const SELECTOR_FIELDS: [keyof Source, string, string][] = [
  ["item_selector", "Listing row", "One element per tender, e.g. article, table tbody tr"],
  ["title_selector", "Title", "Inside the row"],
  ["link_selector", "Link", "Usually a[href]"],
  ["org_selector", "Procuring entity", "Blank: guessed from the title"],
  ["ref_selector", "Reference no.", "Blank: found in the text"],
  ["date_selector", "Published date", ""],
  ["deadline_selector", "Deadline", "Blank: found in the text"],
  ["wait_for", "Wait for (browser only)", "Selector that appears once the page has loaded"],
];

function SourceEditor({ source, onClose }: { source: Source; onClose: () => void }) {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["lead-portal", "meta"], queryFn: () => api.get<{ sectors: string[] }>("/meta"), staleTime: Infinity });
  const [form, setForm] = useState<Source>(source);
  const set = (k: keyof Source) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const body = () => {
    const { id: _id, lastRun: _l, source_key: _k, ...rest } = form;
    return rest;
  };
  const save = useMutation({
    mutationFn: () => api.put<Source>(`/sources/${source.id}`, body()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-portal", "sources"] });
      onClose();
    },
  });
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; error: string; found: number; relevant: number; leads: Lead[] }>(`/sources/${source.id}/test`, body()),
  });

  return (
    <Modal title={source.name} onClose={onClose} wide>
      <fieldset disabled={!isAdmin} className="form">
        <div className="lp-form-grid">
          <Field label="Name"><input value={form.name} onChange={set("name")} /></Field>
          <Field label="URL"><input value={form.url} onChange={set("url")} /></Field>
          <Field label="Fetch with">
            <select value={form.kind} onChange={set("kind")}>
              <option value="html">HTML (fast, no JavaScript)</option>
              <option value="playwright">Browser (JavaScript sites)</option>
              <option value="worldbank_api">World Bank API</option>
            </select>
          </Field>
          <Field label="Default sector">
            <select value={form.default_sector} onChange={set("default_sector")}>
              <option value="">(classify from text)</option>
              {meta.data?.sectors.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          {form.kind !== "worldbank_api"
            ? SELECTOR_FIELDS.map(([k, label, hint]) => (
                <Field key={k} label={label} hint={hint}>
                  <input className="mono" value={String(form[k] ?? "")} onChange={set(k)} />
                </Field>
              ))
            : null}
          <Field label="Notes"><input value={form.notes || ""} onChange={set("notes")} /></Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked ? 1 : 0 }))} /> Enabled in daily runs
        </label>
      </fieldset>
      <ErrorNote error={save.error || test.error} />
      {isAdmin ? (
        <div className="row gap">
          <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>Save</button>
          <button className="btn btn-secondary" onClick={() => test.mutate()} disabled={test.isPending}>{test.isPending ? "Testing… (visits the site)" : "Test these selectors"}</button>
        </div>
      ) : null}
      {test.data ? (
        <div className="test-result">
          <p>
            {test.data.ok ? <Pill tone="ok">Reached</Pill> : <Pill tone="failed">Failed</Pill>} {test.data.found} listings found, {test.data.relevant} match a target keyword.
            {test.data.error ? <span className="text-error"> {test.data.error}</span> : null}
          </p>
          {test.data.leads.length ? (
            <table className="table compact">
              <thead><tr><th>Match</th><th className="num">Score</th><th>Entity</th><th>Title</th><th>Ref</th><th>Deadline</th></tr></thead>
              <tbody>
                {test.data.leads.map((l, i) => (
                  <tr key={i}>
                    <td>{l.relevant ? "✓" : ""}</td>
                    <td className="num"><ScoreBadge score={l.score} /></td>
                    <td>{l.company}</td>
                    <td className="clip" title={l.title}>{l.title}</td>
                    <td>{l.sourceRef}</td>
                    <td>{l.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="No listings matched the selectors" />}
        </div>
      ) : null}
    </Modal>
  );
}

// ------------------------------------------------------------------------------------ keywords

type KeywordForm = Omit<Keyword, "id" | "spellings"> & { id?: number; spellings: string };
const blankKeyword: KeywordForm = { label: "", weight: 20, spellings: "", risk_category: "", outreach_angle: "", active: 1 };

function Keywords() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "keywords"], queryFn: () => api.get<Keyword[]>("/keywords") });
  const [editing, setEditing] = useState<KeywordForm | null>(null);
  const save = useMutation({
    mutationFn: (k: KeywordForm) => (k.id ? api.put(`/keywords/${k.id}`, k) : api.post("/keywords", k)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-portal", "keywords"] });
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/keywords/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-portal", "keywords"] }),
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;

  return (
    <section className="card table-card">
      <header className="card-head">
        <p className="muted">A tender is kept only if it contains one of these phrases. The weight (1-50) feeds the score; the angle is the outreach line in the digest.</p>
        {isAdmin ? <button className="btn btn-sm" onClick={() => setEditing(blankKeyword)}>Add keyword</button> : null}
      </header>
      <table className="table">
        <thead><tr><th>Keyword</th><th className="num">Weight</th><th>Matches</th><th>Risk category</th><th>Active</th><th /></tr></thead>
        <tbody>
          {data.map((k) => (
            <tr key={k.id}>
              <td><strong>{k.label}</strong></td>
              <td className="num">{k.weight}</td>
              <td className="small">{k.spellings.join(", ")}</td>
              <td className="small">{k.risk_category}</td>
              <td>{k.active ? <Pill tone="ok">On</Pill> : <Pill tone="muted">Off</Pill>}</td>
              <td className="right">
                {isAdmin ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...k, spellings: k.spellings.join(", ") })}>Edit</button>{" "}
                    <button className="btn btn-secondary btn-sm lp-danger" onClick={async () => (await confirmDialog(`Delete "${k.label}"?`)) && remove.mutate(k.id)}>Delete</button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? (
        <Modal title={editing.id ? `Edit ${editing.label}` : "Add keyword"} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
            <Field label="Label"><input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} required /></Field>
            <Field label="Weight (1-50)"><input type="number" min={1} max={50} value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: Number(e.target.value) })} /></Field>
            <Field label="Phrases to match" hint="Comma-separated, case-insensitive, whole words">
              <textarea rows={3} value={editing.spellings} onChange={(e) => setEditing({ ...editing, spellings: e.target.value })} required />
            </Field>
            <Field label="Risk / opportunity category"><input value={editing.risk_category} onChange={(e) => setEditing({ ...editing, risk_category: e.target.value })} required /></Field>
            <Field label="Outreach angle (one sentence)"><textarea rows={2} value={editing.outreach_angle} onChange={(e) => setEditing({ ...editing, outreach_angle: e.target.value })} required /></Field>
            <label className="check"><input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })} /> Active</label>
            <ErrorNote error={save.error} />
            <button className="btn" disabled={save.isPending}>Save</button>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------------------------ watchlist

type CompanyForm = Omit<WatchedCompany, "id"> & { id?: number };

function Watchlist() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["lead-portal", "meta"], queryFn: () => api.get<{ sectors: string[] }>("/meta"), staleTime: Infinity });
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "watchlist"], queryFn: () => api.get<WatchedCompany[]>("/watchlist") });
  const [editing, setEditing] = useState<CompanyForm | null>(null);
  const save = useMutation({
    mutationFn: (c: CompanyForm) => (c.id ? api.put(`/watchlist/${c.id}`, c) : api.post("/watchlist", c)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-portal", "watchlist"] });
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/watchlist/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-portal", "watchlist"] }) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;

  return (
    <section className="card table-card">
      <header className="card-head">
        <p className="muted">
          Each company is searched as <code>"Name" Nigeria "New Project" / "Facility launch" / "Expansion" / "Appointed new CFO"</code>. Adding the
          website domain makes contact finding much better.
        </p>
        {isAdmin ? <button className="btn btn-sm" onClick={() => setEditing({ name: "", sector: "Oil & Gas", domain: "", active: 1, notes: "" })}>Add company</button> : null}
      </header>
      {!data.length ? <Empty title="The watchlist is empty" /> : (
        <table className="table">
          <thead><tr><th>Company</th><th>Sector</th><th>Website</th><th>Active</th><th /></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong>{c.notes ? <div className="muted small">{c.notes}</div> : null}</td>
                <td>{c.sector}</td>
                <td>{c.domain || <span className="muted">—</span>}</td>
                <td>{c.active ? <Pill tone="ok">On</Pill> : <Pill tone="muted">Off</Pill>}</td>
                <td className="right">
                  {isAdmin ? (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...c })}>Edit</button>{" "}
                      <button className="btn btn-secondary btn-sm lp-danger" onClick={async () => (await confirmDialog(`Remove ${c.name}?`)) && remove.mutate(c.id)}>Remove</button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing ? (
        <Modal title={editing.id ? `Edit ${editing.name}` : "Add company"} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
            <Field label="Company name"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></Field>
            <Field label="Sector">
              <select value={editing.sector} onChange={(e) => setEditing({ ...editing, sector: e.target.value })}>
                {meta.data?.sectors.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Website domain" hint="e.g. seplatenergy.com"><input value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value })} /></Field>
            <Field label="Notes"><input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })} /> Monitor this company</label>
            <ErrorNote error={save.error} />
            <button className="btn" disabled={save.isPending}>Save</button>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
