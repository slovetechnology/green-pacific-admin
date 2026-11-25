import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import type { CoverageGaps, RiskProfileResponse } from "../api/types";
import "@/shared/styles/executive.css";
import "../risk.css";

// The client's risk profile: the facts the coverage gap rules test. Every field may be left blank
// ("not recorded"); the gap engine then uses what the client's policies show, which is offered here
// as a hint.
const GROUPS: { title: string; fields: string[] }[] = [
  { title: "Business", fields: ["client_type", "industry_sector", "employee_count", "annual_payroll", "nsitf_compliant"] },
  { title: "Premises & construction", fields: ["occupies_public_building", "public_building_type", "owns_commercial_property", "has_plant_machinery", "has_construction", "construction_floors"] },
  { title: "Operations", fields: ["vehicle_count", "is_importer", "moves_goods", "aviation_operator", "healthcare_provider", "receives_visitors", "holds_inventory", "handles_cash", "professional_services", "data_heavy"] },
];

const HELP: Record<string, string> = {
  employee_count: "3 or more makes Group Life compulsory (Pension Reform Act 2014).",
  annual_payroll: "Total annual emoluments; Group Life must be at least 3x this.",
  occupies_public_building: "Offices, shops, hotels, schools, hospitals or recreational buildings (Insurance Act s.65).",
  construction_floors: "More than 2 floors makes builders' liability compulsory (Insurance Act s.64).",
  nsitf_compliant: "Yes exempts the client from the Employee's Compensation gap.",
  is_importer: "Imports must be insured with a Nigerian insurer (Insurance Act s.67).",
};

type Values = Record<string, string>;

// The form's starting values from the stored profile (blank = not recorded).
function initialValues(data: RiskProfileResponse): Values {
  const next: Values = {};
  for (const f of data.fields) {
    const v = data.profile?.[f.field];
    next[f.field] = v === null || v === undefined ? "" : f.kind === "boolean" ? (Number(v) ? "yes" : "no") : String(v);
  }
  next.notes = String(data.profile?.notes ?? "");
  return next;
}

export function RiskProfilePage() {
  const { clientId } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["risk-profile", clientId],
    queryFn: () => api.get<RiskProfileResponse>(`/api/clients/${clientId}/risk-profile`),
  });
  if (isLoading) return <p className="exec-state">Loading…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load the risk profile.</p>;
  return <RiskProfileForm clientId={String(clientId)} data={data} />;
}

function RiskProfileForm({ clientId, data }: { clientId: string; data: RiskProfileResponse }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>(() => initialValues(data));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const gapsQuery = useQuery({
    queryKey: ["risk-analytics", clientId, "gaps"],
    queryFn: () => api.get<CoverageGaps>(`/api/clients/${clientId}/analytics/coverage-gaps`),
  });

  const fieldOf = Object.fromEntries(data.fields.map((f) => [f.field, f]));
  // What the engine would use for a blank field (from policies or KYC).
  const inferred = Object.fromEntries((gapsQuery.data?.facts ?? []).filter((f) => f.source !== "profile").map((f) => [f.field, f]));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.put(`/api/clients/${clientId}/risk-profile`, values);
      await queryClient.invalidateQueries({ queryKey: ["risk-analytics", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["risk-profile", clientId] });
      navigate(`/clients/${clientId}?tab=risk`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function input(field: string) {
    const f = fieldOf[field];
    if (!f) return null;
    const value = values[field] ?? "";
    const set = (v: string) => setValues((prev) => ({ ...prev, [field]: v }));
    const hint = inferred[field];
    const hintText = hint
      ? `Blank uses: ${typeof hint.value === "boolean" ? (hint.value ? "Yes" : "No") : field === "annual_payroll" ? fmtMoney(hint.value) : String(hint.value)} (${hint.note ?? hint.source})`
      : null;
    let control;
    if (f.kind === "boolean") {
      control = (
        <select id={field} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Not recorded</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    } else if (field === "client_type") {
      control = (
        <select id={field} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Not recorded</option>
          {data.clientTypes.map((t) => (
            <option key={t} value={t}>
              {t === "corporate" ? "Corporate" : "Individual"}
            </option>
          ))}
        </select>
      );
    } else if (field === "industry_sector" || field === "public_building_type") {
      const list = field === "industry_sector" ? data.sectors : data.buildingTypes;
      control = (
        <select id={field} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Not recorded</option>
          {list.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {value && !list.includes(value) && <option value={value}>{value}</option>}
        </select>
      );
    } else {
      control = <input id={field} type="number" min="0" step={field === "annual_payroll" ? "0.01" : "1"} value={value} onChange={(e) => set(e.target.value)} />;
    }
    return (
      <div className="field" key={field}>
        <label htmlFor={field}>{f.label}</label>
        {control}
        {HELP[field] && <small>{HELP[field]}</small>}
        {hintText && !value && <small>{hintText}</small>}
      </div>
    );
  }

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">
            <Link to={`/clients/${clientId}?tab=risk`}>{data.client.name}</Link> · Risk profile
          </span>
          <h1>Risk profile</h1>
        </div>
        <div className="exec-meta">
          <span>{data.profile?.reviewed_at ? `Last reviewed ${data.profile.reviewed_at}${data.profile.updated_by ? ` by ${data.profile.updated_by}` : ""}` : "Not recorded yet"}</span>
        </div>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <p className="exec-state" style={{ padding: 0 }}>
          These facts decide which compulsory and recommended insurances apply. Leave a field as “Not recorded” if you don't know: the
          analysis then uses what the client's policies show, where they show it.
        </p>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="section-title">{g.title}</div>
            <div className="risk-profile-grid">{g.fields.map(input)}</div>
          </section>
        ))}
        <div className="section-title">Notes</div>
        <div className="field">
          <textarea rows={3} value={values.notes ?? ""} onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))} aria-label="Notes" />
        </div>
        {error && <p className="exec-state is-crit">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : "Save risk profile"}
          </button>
          <Link className="btn btn-secondary" to={`/clients/${clientId}?tab=risk`}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
