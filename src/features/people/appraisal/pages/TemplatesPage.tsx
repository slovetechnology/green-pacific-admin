import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface TemplateItem {
  id: number;
  item_type: "kpi" | "competency";
  kpi_id: number | null;
  competency_id: number | null;
  weight: number;
  default_target: number | null;
  kpi_code: string | null;
  kpi_name: string | null;
  unit: string | null;
  source_type: string | null;
  kpi_default_target: number | null;
  band_rule_json: string | null;
  competency_name: string | null;
}

interface Template {
  id: number;
  role_family: string;
  version: number;
  w_kpi: number;
  w_competency: number;
  w_conduct: number;
  in_use: number;
  items: TemplateItem[];
}

interface LibraryKpi {
  id: number;
  code: string;
  name: string;
  description: string | null;
  role_family: string;
  unit: string;
  direction: "up" | "down";
  source_type: string;
  scope_level: string;
  default_target: number | null;
  target_note: string | null;
  band_rule_json: string | null;
  min_volume: number;
  is_active: number;
}

interface LibraryCompetency {
  id: number;
  code: string;
  name: string;
  scope: string;
  anchor_1: string;
  anchor_3: string;
  anchor_5: string;
  is_active: number;
}

interface Library {
  kpis: LibraryKpi[];
  competencies: LibraryCompetency[];
  roleFamilies: string[];
}

type Tab = "templates" | "kpis" | "competencies";

// HR's form builder: role templates (weights, KPIs, competencies), and the
// KPI and competency library they draw on. Saving a template already used
// by an appraisal creates a new version; appraisals in progress keep theirs.
export function TemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["appraisal", "templates"],
    queryFn: () => api.get<{ templates: Template[]; library: Library }>("/api/appraisal/templates"),
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("templates");
  if (isLoading || !data) return <div className="card">Loading…</div>;
  const template = data.templates.find((t) => t.id === selected) ?? data.templates[0];

  return (
    <div>
      <div className="page-header">
        <h1>Appraisal form builder</h1>
      </div>
      <div className="toolbar" role="tablist" aria-label="Form builder sections">
        {([["templates", "Role templates"], ["kpis", "KPI library"], ["competencies", "Competencies"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "btn btn-sm" : "btn-secondary btn btn-sm"} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "templates" && (
        <>
          <div className="toolbar">
            <select value={template?.id} onChange={(e) => setSelected(Number(e.target.value))} aria-label="Role family">
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>{t.role_family} (v{t.version})</option>
              ))}
            </select>
          </div>
          {template && <TemplateEditor key={template.id} template={template} library={data.library} onSaved={(id) => setSelected(id)} />}
          {template && <TemplatePreview templateId={template.id} />}
        </>
      )}
      {tab === "kpis" && <KpiLibrary library={data.library} />}
      {tab === "competencies" && <CompetencyLibrary library={data.library} />}
    </div>
  );
}

interface Preview {
  template: { role_family: string; version: number; w_kpi: number; w_competency: number; w_conduct: number };
  kpis: { code: string; name: string; description: string | null; unit: string; direction: string; weight: number; target: number | null; target_note: string | null; source_type: string; band_rule: { type: string; bands: { min?: number; max?: number; score: number }[] } | null }[];
  competencies: LibraryCompetency[];
}

// What an employee on this template sees when their appraisal opens.
function TemplatePreview({ templateId }: { templateId: number }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["appraisal", "template-preview", templateId],
    queryFn: () => api.get<Preview>(`/api/appraisal/templates/${templateId}/preview`),
    enabled: open,
  });
  return (
    <div className="card">
      <h2>Employee preview</h2>
      <button type="button" className="btn-secondary btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide preview" : "Show what the employee sees"}
      </button>
      {open && data && (
        <div style={{ marginTop: "1rem", borderLeft: "3px solid var(--border)", paddingLeft: "1rem" }}>
          <p style={{ marginTop: 0 }}>
            <strong>{data.template.role_family}</strong> · KPIs {data.template.w_kpi}%, competencies {data.template.w_competency}%, conduct{" "}
            {data.template.w_conduct}%
          </p>
          <div className="table-wrap">
            <table className="data-grid-table">
              <thead>
                <tr><th>KPI</th><th>Source</th><th className="num">Weight</th><th>Target</th></tr>
              </thead>
              <tbody>
                {data.kpis.map((k) => (
                  <tr key={k.code}>
                    <td><strong>{k.name}</strong>{k.description && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{k.description}</div>}</td>
                    <td>{k.source_type === "auto" ? "ERP" : "Entered"}</td>
                    <td className="num">{k.weight}%</td>
                    <td>
                      {k.band_rule?.type === "absolute"
                        ? `Fixed bands (5 at ${k.band_rule.bands[0].min ?? k.band_rule.bands[0].max} ${k.unit})`
                        : k.target === null
                          ? `Set by the reviewer${k.target_note ? `: ${k.target_note}` : ""}`
                          : `${k.direction === "down" ? "≤ " : ""}${k.target} ${k.unit}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-title">Competencies</div>
          {data.competencies.map((c) => (
            <p key={c.id} style={{ margin: "0.3rem 0" }}>
              <strong>{c.name}</strong>: 1 {c.anchor_1} · 3 {c.anchor_3} · 5 {c.anchor_5}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK_KPI = {
  name: "", description: "", role_family: "", direction: "up", unit: "%", default_target: "", target_note: "", min_volume: "0",
  scoring: "ratio", bands: [{ min: "", max: "", score: "5" }, { min: "", max: "", score: "1" }], is_active: true,
};
type KpiForm = typeof BLANK_KPI;

function kpiToForm(k: LibraryKpi): KpiForm {
  const rule = k.band_rule_json ? JSON.parse(k.band_rule_json) : null;
  return {
    name: k.name, description: k.description || "", role_family: k.role_family, direction: k.direction, unit: k.unit,
    default_target: k.default_target === null ? "" : String(k.default_target), target_note: k.target_note || "", min_volume: String(k.min_volume),
    scoring: rule?.type === "absolute" ? "absolute" : "ratio",
    bands: rule?.type === "absolute"
      ? rule.bands.map((b: { min?: number; max?: number; score: number }) => ({ min: b.min === undefined ? "" : String(b.min), max: b.max === undefined ? "" : String(b.max), score: String(b.score) }))
      : BLANK_KPI.bands,
    is_active: Boolean(k.is_active),
  };
}

// New hand-entered KPIs, and edits to existing ones. How a KPI is scored
// is locked while an appraisal in progress uses it (the backend says so).
function KpiLibrary({ library }: { library: Library }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<KpiForm>(BLANK_KPI);
  const [family, setFamily] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const kpis = library.kpis.filter((k) => !family || k.role_family === family);

  async function save() {
    setMessage(null);
    const body = {
      name: form.name, description: form.description, role_family: form.role_family, direction: form.direction, unit: form.unit,
      default_target: form.default_target, target_note: form.target_note, min_volume: form.min_volume, is_active: form.is_active,
      band_rule: form.scoring === "ratio" ? { type: "ratio" } : { type: "absolute", bands: form.bands },
    };
    try {
      if (editing === "new") await api.post("/api/appraisal/library/kpis", body);
      else await api.put(`/api/appraisal/library/kpis/${editing}`, body);
      setEditing(null);
      setMessage({ kind: "success", text: "KPI saved. Add it to a template to use it." });
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "templates"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not save the KPI." });
    }
  }

  const setBand = (i: number, key: "min" | "max" | "score", value: string) =>
    setForm((f) => ({ ...f, bands: f.bands.map((b, j) => (j === i ? { ...b, [key]: value } : b)) }));

  return (
    <>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      <div className="toolbar">
        <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Role family">
          <option value="">All role families</option>
          {library.roleFamilies.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => { setEditing("new"); setForm({ ...BLANK_KPI, role_family: family }); }}>+ New KPI</button>
      </div>

      {editing !== null && (
        <div className="card">
          <h2>{editing === "new" ? "New KPI (entered by hand)" : `Edit ${form.name}`}</h2>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="kpi-name">Name</label>
              <input id="kpi-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="kpi-family">Role family</label>
              <select id="kpi-family" value={form.role_family} onChange={(e) => setForm({ ...form, role_family: e.target.value })}>
                <option value="">Choose…</option>
                {library.roleFamilies.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="kpi-dir">Better when</label>
              <select id="kpi-dir" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="up">Higher</option>
                <option value="down">Lower</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="kpi-unit">Unit</label>
              <input id="kpi-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%, days, ₦" />
            </div>
            <div className="field">
              <label htmlFor="kpi-target">Default target</label>
              <input id="kpi-target" type="number" step="any" value={form.default_target} onChange={(e) => setForm({ ...form, default_target: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="kpi-desc">Definition and formula</label>
            <textarea id="kpi-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="kpi-note">Target guide for reviewers</label>
            <input id="kpi-note" value={form.target_note} onChange={(e) => setForm({ ...form, target_note: e.target.value })} />
          </div>
          <div className="section-title">Scoring</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="kpi-scoring">Score by</label>
              <select id="kpi-scoring" value={form.scoring} onChange={(e) => setForm({ ...form, scoring: e.target.value })}>
                <option value="ratio">% of target (115% = 5, 100% = 4, 90% = 3, 75% = 2)</option>
                <option value="absolute">Fixed bands on the figure itself</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="kpi-minvol">Minimum records before scoring</label>
              <input id="kpi-minvol" type="number" min={0} value={form.min_volume} onChange={(e) => setForm({ ...form, min_volume: e.target.value })} />
            </div>
          </div>
          {form.scoring === "absolute" && (
            <>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Checked from the top; the first band the figure fits gives the score. Leave the last band open.</p>
              {form.bands.map((b, i) => (
                <div className="form-grid" key={i}>
                  <div className="field"><label htmlFor={`band-min-${i}`}>At least</label><input id={`band-min-${i}`} type="number" step="any" value={b.min} onChange={(e) => setBand(i, "min", e.target.value)} /></div>
                  <div className="field"><label htmlFor={`band-max-${i}`}>At most</label><input id={`band-max-${i}`} type="number" step="any" value={b.max} onChange={(e) => setBand(i, "max", e.target.value)} /></div>
                  <div className="field"><label htmlFor={`band-score-${i}`}>Score</label>
                    <select id={`band-score-${i}`} value={b.score} onChange={(e) => setBand(i, "score", e.target.value)}>
                      {["5", "4", "3", "2", "1"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => setForm((f) => ({ ...f, bands: [...f.bands.slice(0, -1), { min: "", max: "", score: "3" }, f.bands.at(-1)!] }))}>
                Add a band
              </button>
            </>
          )}
          <label style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Available for templates
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={save}>Save KPI</button>
            <button type="button" className="btn-secondary btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="table-wrap card data-grid-card">
        <table className="data-grid-table">
          <thead>
            <tr><th>KPI</th><th>Role family</th><th>Source</th><th>Scoring</th><th></th></tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.id}>
                <td><strong>{k.name}</strong> <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{k.code}</span>{!k.is_active && <> <span className="badge badge-closed">Inactive</span></>}</td>
                <td>{k.role_family}</td>
                <td>{k.source_type === "auto" ? "ERP" : "Entered"}</td>
                <td>{k.band_rule_json ? "Fixed bands" : `% of target, ${k.direction === "up" ? "higher" : "lower"} is better`}</td>
                <td><button type="button" className="btn-secondary btn btn-sm" onClick={() => { setEditing(k.id); setForm(kpiToForm(k)); }}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const BLANK_COMP = { name: "", scope: "role", anchor_1: "", anchor_3: "", anchor_5: "", is_active: true };

function CompetencyLibrary({ library }: { library: Library }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(BLANK_COMP);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save() {
    setMessage(null);
    try {
      if (editing === "new") await api.post("/api/appraisal/library/competencies", form);
      else await api.put(`/api/appraisal/library/competencies/${editing}`, form);
      setEditing(null);
      setMessage({ kind: "success", text: "Competency saved." });
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "templates"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not save the competency." });
    }
  }

  return (
    <>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      <div className="toolbar">
        <button type="button" className="btn btn-sm" onClick={() => { setEditing("new"); setForm(BLANK_COMP); }}>+ New competency</button>
      </div>
      {editing !== null && (
        <div className="card">
          <h2>{editing === "new" ? "New competency" : `Edit ${form.name}`}</h2>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="comp-name">Name</label>
              <input id="comp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="comp-scope">Applies to</label>
              <select id="comp-scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <option value="core">Everyone (core)</option>
                <option value="role">Particular roles</option>
              </select>
            </div>
          </div>
          {(["anchor_1", "anchor_3", "anchor_5"] as const).map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`comp-${k}`}>What a {k.slice(-1)} looks like</label>
              <textarea id={`comp-${k}`} rows={2} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <label style={{ display: "flex", gap: "0.5rem" }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Available for templates
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={save}>Save competency</button>
            <button type="button" className="btn-secondary btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      {library.competencies.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>{c.name} {c.scope === "role" && <span className="badge badge-secondary">Role</span>}</h2>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setEditing(c.id); setForm({ name: c.name, scope: c.scope, anchor_1: c.anchor_1, anchor_3: c.anchor_3, anchor_5: c.anchor_5, is_active: Boolean(c.is_active) }); }}>
              Edit
            </button>
          </div>
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>1: {c.anchor_1}<br />3: {c.anchor_3}<br />5: {c.anchor_5}</p>
        </div>
      ))}
    </>
  );
}

function TemplateEditor({ template, library, onSaved }: { template: Template; library: Library; onSaved: (id: number) => void }) {
  const queryClient = useQueryClient();
  const [weights, setWeights] = useState({ w_kpi: String(template.w_kpi), w_competency: String(template.w_competency), w_conduct: String(template.w_conduct) });
  const [kpis, setKpis] = useState(template.items.filter((i) => i.item_type === "kpi").map((i) => ({ kpi_id: i.kpi_id!, weight: String(i.weight), default_target: i.default_target === null ? "" : String(i.default_target) })));
  const [competencies, setCompetencies] = useState(template.items.filter((i) => i.item_type === "competency").map((i) => i.competency_id!));
  const [addKpi, setAddKpi] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  useEffect(() => setMessage(null), [template.id]);

  const kpiById = new Map(library.kpis.map((k) => [k.id, k]));
  const blockTotal = Number(weights.w_kpi) + Number(weights.w_competency) + Number(weights.w_conduct);
  const kpiTotal = kpis.reduce((s, k) => s + (Number(k.weight) || 0), 0);

  async function save() {
    setMessage(null);
    try {
      const res = await api.put<{ template: Template }>(`/api/appraisal/templates/${template.id}`, {
        ...weights,
        items: [
          ...kpis.map((k) => ({ item_type: "kpi", kpi_id: k.kpi_id, weight: k.weight, default_target: k.default_target })),
          ...competencies.map((id) => ({ item_type: "competency", competency_id: id })),
        ],
      });
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "templates"] });
      onSaved(res.template.id);
      setMessage({
        kind: "success",
        text: res.template.version > template.version ? `Saved as version ${res.template.version}. Appraisals already launched keep version ${template.version}.` : "Saved.",
      });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not save the template." });
    }
  }

  return (
    <>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      <div className="card">
        <h2>{template.role_family}, version {template.version}</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {template.in_use
            ? `Used by ${template.in_use} appraisal(s), so saving creates version ${template.version + 1}.`
            : "Not used by any appraisal yet, so changes apply to this version."}
        </p>
        <div className="section-title">Block weights (must total 100)</div>
        <div className="form-grid">
          {([["w_kpi", "KPIs"], ["w_competency", "Competencies"], ["w_conduct", "Conduct & compliance"]] as const).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`tpl-${key}`}>{label} %</label>
              <input id={`tpl-${key}`} type="number" min={0} value={weights[key]} onChange={(e) => setWeights((w) => ({ ...w, [key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <p style={{ color: Math.abs(blockTotal - 100) < 0.01 ? "var(--text-muted)" : "var(--status-critical)" }}>Total {blockTotal}%</p>
      </div>

      <div className="card">
        <h2>KPIs</h2>
        <div className="table-wrap">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Source</th>
                <th className="num">Weight %</th>
                <th className="num">Default target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k, i) => {
                const def = kpiById.get(k.kpi_id);
                return (
                  <tr key={k.kpi_id}>
                    <td>{def?.name} <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{def?.code}</span></td>
                    <td>{def?.source_type === "auto" ? "ERP" : "Entered"}</td>
                    <td className="num">
                      <input aria-label={`${def?.name} weight`} type="number" min={0} style={{ width: "5rem" }} value={k.weight} onChange={(e) => setKpis((list) => list.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
                    </td>
                    <td className="num">
                      <input
                        aria-label={`${def?.name} default target`}
                        type="number"
                        step="any"
                        style={{ width: "7rem" }}
                        placeholder={def?.default_target === null || def?.default_target === undefined ? "" : String(def.default_target)}
                        value={k.default_target}
                        onChange={(e) => setKpis((list) => list.map((x, j) => (j === i ? { ...x, default_target: e.target.value } : x)))}
                      />{" "}
                      {def?.unit}
                    </td>
                    <td>
                      <button type="button" className="btn-secondary btn btn-sm" onClick={() => setKpis((list) => list.filter((_, j) => j !== i))}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ color: Math.abs(kpiTotal - 100) < 0.01 ? "var(--text-muted)" : "var(--status-critical)" }}>KPI weights total {kpiTotal}%</p>
        <div className="toolbar">
          <select value={addKpi} onChange={(e) => setAddKpi(e.target.value)} aria-label="KPI to add">
            <option value="">Add a KPI from the library…</option>
            {library.kpis.filter((k) => k.is_active && !kpis.some((x) => x.kpi_id === k.id)).map((k) => (
              <option key={k.id} value={k.id}>{k.role_family}: {k.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary btn btn-sm"
            disabled={!addKpi}
            onClick={() => {
              setKpis((list) => [...list, { kpi_id: Number(addKpi), weight: "0", default_target: "" }]);
              setAddKpi("");
            }}
          >
            Add
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>A blank default target uses the library's own (shown greyed). The reviewer can change targets per person before self-assessment opens.</p>
      </div>

      <div className="card">
        <h2>Competencies</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "0.4rem" }}>
          {library.competencies.filter((c) => c.is_active || competencies.includes(c.id)).map((c) => (
            <label key={c.id} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={competencies.includes(c.id)}
                onChange={(e) => setCompetencies((list) => (e.target.checked ? [...list, c.id] : list.filter((x) => x !== c.id)))}
              />
              {c.name} {c.scope === "role" && <span className="badge badge-secondary">Role</span>}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={save}>Save template</button>
        </div>
      </div>
    </>
  );
}
