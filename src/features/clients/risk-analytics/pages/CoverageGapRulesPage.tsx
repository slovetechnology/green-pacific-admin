import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { Modal } from "@/shared/components/exec/Modal";
import { Panel } from "@/shared/components/exec/Panel";
import { PRIORITY_CLASS, type AnalyticsSettings, type Priority } from "../api/types";
import "@/shared/styles/executive.css";
import "../risk.css";

// Admin: the coverage gap rules behind the client Risk & Portfolio Analytics tab, and the
// analytics assumptions (risk tier thresholds, servicing costs).

interface Rule {
  id: number;
  code: string;
  category: string;
  policy_class: string;
  satisfied_by: string[];
  priority: Priority;
  regulatory_reference: string | null;
  trigger: unknown;
  exempt_when: unknown;
  min_cover: unknown;
  rationale: string | null;
  suggested_scope: string | null;
  sort_order: number;
  is_active: number;
  updated_by: string | null;
}

interface Response {
  rules: Rule[];
  categories: string[];
  priorities: Priority[];
  classes: string[];
  facts: { field: string; label: string }[];
  settings: AnalyticsSettings;
}

interface Draft {
  id: number | null;
  code: string;
  category: string;
  policy_class: string;
  satisfied_by: string;
  priority: string;
  regulatory_reference: string;
  trigger: string;
  exempt_when: string;
  min_cover: string;
  rationale: string;
  suggested_scope: string;
  sort_order: string;
  is_active: boolean;
}

const pretty = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v, null, 2));

function toDraft(r: Rule | null): Draft {
  return {
    id: r?.id ?? null,
    code: r?.code ?? "",
    category: r?.category ?? "Commercial Recommended",
    policy_class: r?.policy_class ?? "",
    satisfied_by: (r?.satisfied_by ?? []).join("\n"),
    priority: r?.priority ?? "Medium",
    regulatory_reference: r?.regulatory_reference ?? "",
    trigger: pretty(r?.trigger ?? { any: [{ field: "industry_sector", op: "in", value: ["Manufacturing"] }] }),
    exempt_when: pretty(r?.exempt_when),
    min_cover: pretty(r?.min_cover),
    rationale: r?.rationale ?? "",
    suggested_scope: r?.suggested_scope ?? "",
    sort_order: String(r?.sort_order ?? 500),
    is_active: r ? Boolean(r.is_active) : true,
  };
}

function RuleForm({ draft, data, onDone }: { draft: Draft; data: Response; onDone: () => void }) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = {
      code: d.code,
      category: d.category,
      policy_class: d.policy_class,
      satisfied_by: JSON.stringify(d.satisfied_by.split("\n").map((s) => s.trim()).filter(Boolean)),
      priority: d.priority,
      regulatory_reference: d.regulatory_reference,
      trigger: d.trigger,
      exempt_when: d.exempt_when.trim() || null,
      min_cover: d.min_cover.trim() || null,
      rationale: d.rationale,
      suggested_scope: d.suggested_scope,
      sort_order: d.sort_order,
      is_active: d.is_active,
    };
    try {
      if (d.id) await api.put(`/api/admin/coverage-gap-rules/${d.id}`, body);
      else await api.post("/api/admin/coverage-gap-rules", body);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="risk-report">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="rule_code">Code</label>
          <input id="rule_code" value={d.code} onChange={(e) => set("code", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="rule_category">Category</label>
          <select id="rule_category" value={d.category} onChange={(e) => set("category", e.target.value)}>
            {data.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rule_priority">Priority</label>
          <select id="rule_priority" value={d.priority} onChange={(e) => set("priority", e.target.value)}>
            {data.priorities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor="rule_class">Cover (as shown to staff)</label>
          <input id="rule_class" value={d.policy_class} onChange={(e) => set("policy_class", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="rule_sort">Order</label>
          <input id="rule_sort" type="number" value={d.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
        </div>
        <div className="field span-3">
          <label htmlFor="rule_ref">Regulatory reference (statutory rules)</label>
          <input id="rule_ref" value={d.regulatory_reference} onChange={(e) => set("regulatory_reference", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rule_satisfied">Met by classes (one per line)</label>
          <textarea id="rule_satisfied" className="risk-rule-json" value={d.satisfied_by} onChange={(e) => set("satisfied_by", e.target.value)} />
          <small>A class matches when it starts with one of these, ignoring case and plurals.</small>
        </div>
        <div className="field span-2">
          <label htmlFor="rule_trigger">Applies when (JSON)</label>
          <textarea id="rule_trigger" className="risk-rule-json" value={d.trigger} onChange={(e) => set("trigger", e.target.value)} />
          <small>
            {"{ all: [...] } or { any: [...] } of { field, op, value }. Ops: eq, ne, in, gte, gt, lte, lt, true, false. Fields: "}
            {data.facts.map((f) => f.field).join(", ")}.
          </small>
        </div>
        <div className="field">
          <label htmlFor="rule_exempt">Exempt when (JSON, optional)</label>
          <textarea id="rule_exempt" className="risk-rule-json" value={d.exempt_when} onChange={(e) => set("exempt_when", e.target.value)} />
        </div>
        <div className="field span-2">
          <label htmlFor="rule_min">Minimum cover (JSON, optional)</label>
          <textarea id="rule_min" className="risk-rule-json" value={d.min_cover} onChange={(e) => set("min_cover", e.target.value)} />
          <small>{'{ "type": "multiple_of", "field": "annual_payroll", "multiple": 3 } or { "type": "amount", "amount": 1000000 }'}</small>
        </div>
        <div className="field span-3">
          <label htmlFor="rule_rationale">Rationale</label>
          <textarea id="rule_rationale" rows={2} value={d.rationale} onChange={(e) => set("rationale", e.target.value)} />
          <small>{"{employee_count}, {vehicle_count}, {public_building_label} and {construction_label} are filled in."}</small>
        </div>
        <div className="field span-3">
          <label htmlFor="rule_scope">Suggested cover</label>
          <textarea id="rule_scope" rows={2} value={d.suggested_scope} onChange={(e) => set("suggested_scope", e.target.value)} />
        </div>
        <label className="field" style={{ flexDirection: "row", gap: "0.4rem", alignItems: "center" }}>
          <input type="checkbox" checked={d.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active
        </label>
      </div>
      {error && <p className="exec-state is-crit">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>
    </form>
  );
}

function SettingsForm({ settings, onSaved }: { settings: AnalyticsSettings; onSaved: () => void }) {
  const [v, setV] = useState<Record<keyof AnalyticsSettings, string>>({
    tier_watch_pct: String(settings.tier_watch_pct),
    tier_high_pct: String(settings.tier_high_pct),
    servicing_cost_pct: String(settings.servicing_cost_pct),
    claim_handling_cost: String(settings.claim_handling_cost),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fields: [keyof AnalyticsSettings, string][] = [
    ["tier_watch_pct", "Watchlist from loss ratio (%)"],
    ["tier_high_pct", "High risk above loss ratio (%)"],
    ["servicing_cost_pct", "Servicing cost (% of earned premium)"],
    ["claim_handling_cost", "Claims handling cost per claim (₦)"],
  ];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.put("/api/admin/coverage-gap-rules/settings", v);
      setMsg({ ok: true, text: "Saved." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not save." });
    }
  }
  return (
    <form onSubmit={submit} className="exec-filters">
      {fields.map(([k, label]) => (
        <label key={k} className="exec-filter">
          <span>{label}</span>
          <input type="number" min="0" step="any" value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
        </label>
      ))}
      <button type="submit" className="btn btn-secondary btn-sm">
        Save assumptions
      </button>
      {msg && <span className={msg.ok ? "exec-chip" : "exec-state is-crit"}>{msg.text}</span>}
    </form>
  );
}

export function CoverageGapRulesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["coverage-gap-rules"],
    queryFn: () => api.get<Response>("/api/admin/coverage-gap-rules"),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["coverage-gap-rules"] });
    void queryClient.invalidateQueries({ queryKey: ["risk-analytics"] });
  };

  const columns: DataGridColumn<Rule>[] = [
    { key: "code", header: "Code", render: (r) => <code style={{ whiteSpace: "nowrap" }}>{r.code}</code> },
    { key: "cover", header: "Cover", render: (r) => r.policy_class },
    { key: "category", header: "Tier", render: (r) => (r.category === "Statutory Compulsory" ? "A · Statutory" : "B · Commercial") },
    { key: "priority", header: "Priority", render: (r) => <span className={`badge ${PRIORITY_CLASS[r.priority]}`}>{r.priority}</span> },
    { key: "ref", header: "Reference", render: (r) => r.regulatory_reference || "—" },
    { key: "met", header: "Met by", render: (r) => r.satisfied_by.join(", ") },
    { key: "active", header: "Active", render: (r) => (r.is_active ? "Yes" : <span className="exec-chip is-warn">Off</span>) },
    {
      key: "edit",
      header: <span className="sr-only">Edit</span>,
      align: "right",
      render: (r) => (
        <button type="button" className="exec-rowbtn" onClick={() => setEditing(toDraft(r))}>
          Edit
        </button>
      ),
    },
  ];

  if (isError) return <p className="exec-state is-crit">Could not load the rules (admins only).</p>;
  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Clients & CRM · Admin</span>
          <h1>Coverage gap rules</h1>
        </div>
        <div className="exec-header-actions">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(toDraft(null))} disabled={!data}>
            + New rule
          </button>
        </div>
      </header>
      <p className="exec-state" style={{ padding: 0 }}>
        These rules drive the gap analysis on each client's Risk & Portfolio Analytics tab. Statutory references are a guide; confirm them before relying on
        them in advice.
      </p>

      {data && (
        <Panel title="Analytics assumptions" eyebrow="Risk tiers and servicing costs" flush>
          <SettingsForm settings={data.settings} onSaved={refresh} />
        </Panel>
      )}

      <DataGrid columns={columns} rows={data?.rules} isLoading={isLoading} getRowKey={(r) => r.id} emptyMessage="No rules." />

      <Modal open={editing !== null} onClose={() => setEditing(null)} wide title={editing?.id ? `Edit rule ${editing.code}` : "New coverage gap rule"}>
        {editing && data && (
          <RuleForm
            draft={editing}
            data={data}
            onDone={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
