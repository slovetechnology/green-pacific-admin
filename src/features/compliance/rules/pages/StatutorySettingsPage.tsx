import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { useAuth } from "@/features/platform/auth/AuthContext";
import type { MappingsResponse, SettingsResponse, StatutorySettings } from "../lib/types";

type Tab = "company" | "compliance" | "fidelity" | "classMapping" | "glMapping";
const TABS: { key: Tab; label: string }[] = [
  { key: "company", label: "Company & licence" },
  { key: "compliance", label: "Thresholds" },
  { key: "fidelity", label: "Fidelity cover" },
  { key: "classMapping", label: "Class mapping" },
  { key: "glMapping", label: "Ledger mapping" },
];

const COMPANY_FIELDS: [string, string, string?][] = [
  ["companyName", "Name of broker"], ["rbcNumber", "NAICOM licence (RBC) number"], ["licenceCategory", "Licence category", "Insurance or Ins/Re"],
  ["licenceExpiryDate", "Licence expiry date", "date"], ["rcNumber", "CAC RC number"], ["tin", "Tax identification number"],
  ["address", "Registered address"], ["contactPerson", "Contact person"], ["contactEmail", "Contact email"], ["contactPhone", "Contact phone"],
  ["principalOfficer", "Principal officer"], ["mdCeo", "Managing Director / CEO"], ["complianceOfficer", "Compliance officer"],
];
const COMPLIANCE_FIELDS: [string, string, string][] = [
  ["remittanceDays", "Remittance window (days)", "Days from receiving a client's premium to settling it with the insurer (QR-05)."],
  ["minimumCapital", "Minimum capital (₦)", "0 uses the NIIRA 2025 figure for the licence category (AR-03)."],
  ["piiMinimumCover", "Minimum PII cover (₦)", "0 means not checked (AR-01, AR-03)."],
  ["cashCtrThreshold", "CTR threshold, individuals (₦)", "Cash receipts at or above this need a CTR (QR-09)."],
  ["corporateCtrThreshold", "CTR threshold, corporates (₦)", ""],
  ["complaintResolutionDays", "Complaint resolution target (days)", "QR-08."],
  ["claimsSubmissionDays", "Claim notice to insurer (days)", "QR-07."],
  ["claimsPayoutDays", "Claim money paid to insured (days)", "Days to pass a settlement received from the insurer on to the insured (QR-10)."],
];

// Settings for the NAICOM returns. Admins change them; other staff can read them. Every change is audited.
export function StatutorySettingsPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("company");
  const [draft, setDraft] = useState<StatutorySettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["statutory-settings"], queryFn: () => api.get<SettingsResponse>("/api/statutory-reports/settings") });
  const { data: mappings } = useQuery({
    queryKey: ["statutory-mappings"], queryFn: () => api.get<MappingsResponse>("/api/statutory-reports/settings/mappings"),
    enabled: tab === "classMapping" || tab === "glMapping",
  });
  useEffect(() => { if (data) setDraft(structuredClone(data.settings)); }, [data]);

  const save = useMutation({
    mutationFn: (key: Tab) => api.put(`/api/statutory-reports/settings/${key}`, { value: draft?.[key] }),
    onSuccess: () => {
      setMessage("Saved. New previews and refreshed drafts use these settings; approved filings keep the figures they were approved with.");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["statutory-settings"] });
      queryClient.invalidateQueries({ queryKey: ["statutory-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["statutory-registry"] });
    },
    onError: (err) => { setError(err instanceof ApiError ? err.message : "Could not save."); setMessage(null); },
  });

  if (!data || !draft) return <div className="card">Loading settings...</div>;
  const setField = (section: "company" | "compliance" | "fidelity", key: string, value: string) =>
    setDraft({ ...draft, [section]: { ...draft[section], [key]: value } });
  const setMap = (section: "classMapping" | "glMapping", key: string, value: string) => {
    const next = { ...draft[section] };
    if (value) next[key] = value; else delete next[key];
    setDraft({ ...draft, [section]: next });
  };
  const profile = data.profile as unknown as Record<string, string>;

  return <div>
    <div className="page-header">
      <div>
        <p className="eyebrow">Compliance</p>
        <h1>NAICOM Returns Settings</h1>
        <p className="page-lede">The broker's licence details, the thresholds the returns test against, and how the ERP's classes and ledger accounts map onto NAICOM's. Confirm every regulatory figure against the current NAICOM circulars before filing.</p>
      </div>
      <div className="page-header-actions"><Link className="btn-secondary" to="/compliance/returns">Returns workbench</Link></div>
    </div>
    <div className="toolbar" role="tablist">
      {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => { setTab(t.key); setMessage(null); setError(null); }}>{t.label}</button>)}
    </div>
    {message && <div className="flash flash-success">{message}</div>}
    {error && <div className="flash flash-error">{error}</div>}
    {!isAdmin && <div className="flash flash-info">Only an admin can change these settings.</div>}

    <div className="card">
      {tab === "company" && <div className="form-grid">
        {COMPANY_FIELDS.map(([key, label, kind]) => <div className="field" key={key}>
          <label htmlFor={`co-${key}`}>{label}</label>
          <input id={`co-${key}`} type={kind === "date" ? "date" : "text"} disabled={!isAdmin} value={String(draft.company[key] ?? "")} onChange={(e) => setField("company", key, e.target.value)} />
          <div className="field-hint">{kind && kind !== "date" ? `${kind}. ` : ""}{!draft.company[key] && profile[key] ? `In use now: ${profile[key]} (from the environment or company defaults).` : ""}</div>
        </div>)}
      </div>}
      {tab === "compliance" && <div className="form-grid">
        {COMPLIANCE_FIELDS.map(([key, label, hint]) => <div className="field" key={key}>
          <label htmlFor={`cp-${key}`}>{label}</label>
          <input id={`cp-${key}`} type="number" min={0} disabled={!isAdmin} value={String(draft.compliance[key] ?? "")} onChange={(e) => setField("compliance", key, e.target.value)} />
          {hint && <div className="field-hint">{hint}</div>}
        </div>)}
        <div className="field field-wide"><div className="field-hint">NAICOM commission caps are the rules on the <Link to="/policy-compliance">Policy Compliance</Link> page; QR-03 tests against those. The firm's professional indemnity cover is its E&O policy under People.</div></div>
      </div>}
      {tab === "fidelity" && <div className="form-grid">
        {([["insurer", "Insurer", "text"], ["policyNo", "Policy number", "text"], ["limit", "Limit (₦)", "number"], ["expiry", "Expiry date", "date"]] as const).map(([key, label, type]) => <div className="field" key={key}>
          <label htmlFor={`fg-${key}`}>{label}</label>
          <input id={`fg-${key}`} type={type} disabled={!isAdmin} value={String(draft.fidelity[key] ?? "")} onChange={(e) => setField("fidelity", key, e.target.value)} />
        </div>)}
      </div>}
      {tab === "classMapping" && <div>
        <p className="field-hint">Each class of business on your policies and the NAICOM class it is reported under. "Inferred" classes were placed by name; pick a class to fix one.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>ERP class of business</th><th className="num">Policies</th><th>NAICOM class</th><th></th></tr></thead>
          <tbody>{(mappings?.classes || []).map((c) => {
            const key = c.name.toLowerCase();
            return <tr key={key}>
              <td data-label="ERP class">{c.name}</td><td className="num" data-label="Policies">{c.policies}</td>
              <td data-label="NAICOM class"><select disabled={!isAdmin} value={draft.classMapping[key] || ""} onChange={(e) => setMap("classMapping", key, e.target.value)}>
                <option value="">Inferred: {mappings?.naicomClasses.find((n) => n.code === c.naicomClass)?.name || c.naicomClass}</option>
                {(mappings?.naicomClasses || []).map((n) => <option key={n.code} value={n.code}>{n.name}</option>)}
              </select></td>
              <td>{c.mapped ? "Saved" : "Inferred"}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>}
      {tab === "glMapping" && <div>
        <p className="field-hint">Each postable ledger account and the NAICOM statement line it is reported on (QR-01, QR-02, QR-10, AR-03). "Inferred" lines come from the account code.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Account</th><th>Type</th><th>NAICOM line</th><th></th></tr></thead>
          <tbody>{(mappings?.accounts || []).map((a) => <tr key={a.code}>
            <td data-label="Account">{a.code} {a.name}</td><td data-label="Type">{a.type}</td>
            <td data-label="NAICOM line"><select disabled={!isAdmin} value={draft.glMapping[a.code] || ""} onChange={(e) => setMap("glMapping", a.code, e.target.value)}>
              <option value="">Inferred: {mappings?.fsLines.find((l) => l.code === a.line)?.name || a.line || "none"}</option>
              {(mappings?.fsLines || []).map((l) => <option key={l.code} value={l.code}>{l.statement === "PL" ? "P&L" : "SOFP"} · {l.name}</option>)}
            </select></td>
            <td>{a.mapped ? "Saved" : "Inferred"}</td>
          </tr>)}</tbody>
        </table></div>
      </div>}
      <RoleGate need="admin">
        <div className="page-header-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(tab)}>Save {TABS.find((t) => t.key === tab)?.label.toLowerCase()}</button>
        </div>
      </RoleGate>
    </div>
  </div>;
}
