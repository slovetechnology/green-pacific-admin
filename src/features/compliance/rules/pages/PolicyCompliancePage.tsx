import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { promptDialog } from "@/shared/components/Dialogs";

interface ComplianceException {
  id: number;
  transaction_id: number;
  rule_id: number;
  rule_code: string;
  rule_name: string;
  severity: "block" | "warn";
  message: string;
  status: "Open" | "Overridden" | "Resolved";
  first_seen_at: string;
  last_seen_at: string;
  overridden_by: string | null;
  override_reason: string | null;
  policy_no: string | null;
  class_of_business: string | null;
  client_id: number;
  client_name: string;
}

interface Rule {
  id: number;
  code: string;
  rule_type: string;
  name: string;
  description: string | null;
  class_of_business: string | null;
  params_json: string;
  severity: "block" | "warn";
  is_active: number;
  effective_from: string | null;
  updated_by: string | null;
  updated_at: string;
}

type RuleTypes = Record<string, { label: string; params: string[]; classScoped: boolean }>;

const PARAM_LABELS: Record<string, string> = {
  min: "Minimum (₦)",
  max_percent: "Maximum commission rate (%)",
  grace_days: "Grace period (days after cover starts)",
};

// Policy compliance: exceptions raised by the rules, and (admins) the rules
// themselves. Backend: lib/compliance.js.
export function PolicyCompliancePage() {
  const [tab, setTab] = useState<"exceptions" | "rules">("exceptions");
  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>Policy Compliance</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Every policy is checked against these rules when it's saved and again daily. A blocking rule stops the save unless an
            admin overrides it with a reason; a warning lets it through and is listed here until fixed.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <button type="button" className={`btn-sm ${tab === "exceptions" ? "btn" : "btn-secondary"}`} onClick={() => setTab("exceptions")}>
          Exceptions
        </button>
        <button type="button" className={`btn-sm ${tab === "rules" ? "btn" : "btn-secondary"}`} onClick={() => setTab("rules")}>
          Rules
        </button>
      </div>
      {tab === "exceptions" ? <ExceptionsTab /> : <RulesTab />}
    </div>
  );
}

function ExceptionsTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState("Open");
  const [ruleId, setRuleId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["policy-compliance", "exceptions", status, ruleId],
    queryFn: () =>
      api.get<{ exceptions: ComplianceException[]; byRule: { id: number; name: string; severity: string; open_count: number }[] }>(
        `/api/policy-compliance/exceptions?status=${encodeURIComponent(status)}&rule_id=${encodeURIComponent(ruleId)}`
      ),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["policy-compliance"] });
  }

  async function rescan() {
    setMessage(null);
    try {
      const r = await api.post<{ scanned: number; opened: number; resolved: number; open: number }>("/api/policy-compliance/rescan");
      setMessage(`Checked ${r.scanned} policies: ${r.opened} new exception(s), ${r.resolved} resolved, ${r.open} open.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Rescan failed.");
    }
  }

  async function override(e: ComplianceException) {
    const reason = await promptDialog({ title: "Override compliance rule", message: `Override "${e.rule_name}" on ${e.policy_no || `policy #${e.transaction_id}`}? Reason (recorded):`, required: true, multiline: true, confirmLabel: "Override" });
    if (!reason || !reason.trim()) return;
    try {
      await api.post(`/api/policy-compliance/exceptions/${e.id}/override`, { reason });
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Override failed.");
    }
  }

  return (
    <>
      {message && <div className="flash flash-info">{message}</div>}
      <div className="card">
        <h2>Open exceptions by rule</h2>
        <div className="detail-grid">
          {(data?.byRule ?? []).map((r) => (
            <div key={r.id}>
              <div className="k">
                {r.name} ({r.severity === "block" ? "blocks" : "warns"})
              </div>
              <div className="v">
                <button type="button" className="btn-link" onClick={() => setRuleId(ruleId === String(r.id) ? "" : String(r.id))}>
                  {r.open_count}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="Open">Open</option>
          <option value="Overridden">Overridden</option>
          <option value="Resolved">Resolved</option>
          <option value="all">All</option>
        </select>
        {ruleId && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRuleId("")}>
            Clear rule filter
          </button>
        )}
        <RoleGate need="write">
          <button type="button" className="btn-secondary btn-sm" onClick={rescan}>
            Rescan all policies
          </button>
        </RoleGate>
      </div>
      {isLoading ? (
        <p>Loading…</p>
      ) : !data?.exceptions.length ? (
        <p>No {status === "all" ? "" : status.toLowerCase()} exceptions.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Client</th>
                <th>Rule</th>
                <th>Problem</th>
                <th>Status</th>
                <th>Last checked</th>
                {user?.isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.exceptions.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/transactions/${e.transaction_id}`}>{e.policy_no || `#${e.transaction_id}`}</Link>
                  </td>
                  <td>
                    <Link to={`/clients/${e.client_id}`}>{e.client_name}</Link>
                  </td>
                  <td>{e.rule_name}</td>
                  <td>
                    {e.message}
                    {e.override_reason && (
                      <div>
                        <small>
                          Overridden by {e.overridden_by}: {e.override_reason}
                        </small>
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={e.status === "Open" ? (e.severity === "block" ? "Blocked" : "Warning") : e.status} />
                  </td>
                  <td>{e.last_seen_at.slice(0, 10)}</td>
                  {user?.isAdmin && (
                    <td>
                      {e.status === "Open" && (
                        <button type="button" className="btn-secondary btn btn-sm" onClick={() => override(e)}>
                          Override
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RulesTab() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["policy-compliance", "rules"],
    queryFn: () => api.get<{ rules: Rule[]; ruleTypes: RuleTypes }>("/api/policy-compliance/rules"),
  });
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  if (isLoading || !data) return <p>Loading…</p>;
  return (
    <>
      {user?.isAdmin && (
        <div className="toolbar">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing("new")}>
            + Add rule
          </button>
        </div>
      )}
      {editing && <RuleForm rule={editing === "new" ? null : editing} ruleTypes={data.ruleTypes} onDone={() => setEditing(null)} />}
      <div className="table-wrap">
        <table className="data-grid-table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Applies to</th>
              <th>Settings</th>
              <th>Severity</th>
              <th>Applies from</th>
              <th>Status</th>
              {user?.isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {data.rules.map((r) => {
              const params = JSON.parse(r.params_json || "{}") as Record<string, number>;
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.description && (
                      <div>
                        <small>{r.description}</small>
                      </div>
                    )}
                  </td>
                  <td>{r.class_of_business || "All classes"}</td>
                  <td>
                    {Object.entries(params)
                      .map(([k, v]) => `${PARAM_LABELS[k] || k}: ${v}`)
                      .join(", ") || "—"}
                  </td>
                  <td>{r.severity === "block" ? "Blocks the save" : "Warns"}</td>
                  <td>{r.effective_from || "All policies"}</td>
                  <td>{r.is_active ? "On" : "Off"}</td>
                  {user?.isAdmin && (
                    <td>
                      <button type="button" className="btn-secondary btn btn-sm" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        The statutory motor TPPD minimums and NAICOM commission caps were entered from figures supplied on 2026-09-25 and apply
        to policies from that date. Edit them here when NAICOM changes a figure.
      </p>
    </>
  );
}

function RuleForm({ rule, ruleTypes, onDone }: { rule: Rule | null; ruleTypes: RuleTypes; onDone: () => void }) {
  const queryClient = useQueryClient();
  const existingParams = rule ? (JSON.parse(rule.params_json || "{}") as Record<string, number>) : {};
  const [ruleType, setRuleType] = useState(rule?.rule_type || "min_sum_insured");
  const [name, setName] = useState(rule?.name || "");
  const [description, setDescription] = useState(rule?.description || "");
  const [classOfBusiness, setClassOfBusiness] = useState(rule?.class_of_business || "");
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(existingParams).map(([k, v]) => [k, String(v)]))
  );
  const [severity, setSeverity] = useState(rule?.severity || "warn");
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effective_from || "");
  const [isActive, setIsActive] = useState(rule ? Boolean(rule.is_active) : true);
  const [error, setError] = useState<string | null>(null);
  const spec = ruleTypes[ruleType];

  async function save() {
    setError(null);
    const body = {
      rule_type: ruleType,
      name,
      description,
      class_of_business: classOfBusiness,
      params,
      severity,
      effective_from: effectiveFrom,
      is_active: isActive,
    };
    try {
      if (rule) await api.put(`/api/policy-compliance/rules/${rule.id}`, body);
      else await api.post("/api/policy-compliance/rules", body);
      await queryClient.invalidateQueries({ queryKey: ["policy-compliance"] });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the rule.");
    }
  }

  return (
    <div className="card">
      <h2>{rule ? `Edit rule: ${rule.name}` : "Add rule"}</h2>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="form-grid">
        <label>
          Check
          <select value={ruleType} onChange={(e) => setRuleType(e.target.value)} disabled={Boolean(rule)}>
            {Object.entries(ruleTypes).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Motor third party minimum" />
        </label>
        {spec?.classScoped && (
          <label>
            Class of business (blank = all)
            <input value={classOfBusiness} onChange={(e) => setClassOfBusiness(e.target.value)} placeholder="e.g. Private Motor" />
          </label>
        )}
        {spec?.params.map((p) => (
          <label key={p}>
            {PARAM_LABELS[p] || p}
            <input type="number" value={params[p] ?? ""} onChange={(e) => setParams({ ...params, [p]: e.target.value })} />
          </label>
        ))}
        <label>
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as "block" | "warn")}>
            <option value="warn">Warn (save, and list the exception)</option>
            <option value="block">Block the save (admins can override)</option>
          </select>
        </label>
        <label>
          Applies to policies from (blank = all)
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Source, e.g. NAICOM circular ref." />
        </label>
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Rule is on
        </label>
      </div>
      <p>
        <small>
          A class rule for "Private Motor" also covers "Private Motor — Comprehensive". List other spellings with "|", e.g.
          "Industrial All Risks|Industrial All Risk". Saving re-checks every policy.
        </small>
      </p>
      <button type="button" className="btn" onClick={save}>
        Save rule
      </button>{" "}
      <button type="button" className="btn-secondary btn" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}
