import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { ClaimsRegisterSection } from "../components/sections/ClaimsRegisterSection";
import { PremiumRegisterSection } from "../components/sections/PremiumRegisterSection";
import { ReinsuranceReturnSection } from "../components/sections/ReinsuranceReturnSection";
import { fieldsFor, type FieldDef, type FieldGroup } from "../lib/reportFields";
import { isEditable, type ReportPayload, type ReportResponse, type StatutoryReport } from "../lib/types";

function fieldValue(payload: ReportPayload, field: FieldDef): string | number | boolean {
  const value = payload[field.key];
  if (field.kind === "check") return Boolean(value);
  return value === undefined || value === null ? "" : (value as string | number);
}

function ManualFields({ report, payload, onChange, editable }: {
  report: StatutoryReport;
  payload: ReportPayload;
  onChange: (key: string, value: string | number | boolean) => void;
  editable: boolean;
}) {
  return <>
    {fieldsFor(report.report_type).map((group: FieldGroup) => <section key={group.title}>
      <div className="section-title">{group.title}</div>
      <div className="form-grid">
        {group.fields.map((field) => {
          const value = fieldValue(payload, field);
          if (field.kind === "check") return <label className="checkbox-field" key={field.key}>
            <input type="checkbox" checked={Boolean(value)} disabled={!editable} onChange={(event) => onChange(field.key, event.target.checked)} />
            <span>{field.label}</span>
          </label>;
          const onFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field.key, event.target.value);
          return <div className={field.kind === "textarea" ? "field field-wide" : "field"} key={field.key}>
            <label htmlFor={field.key}>{field.label}</label>
            {field.kind === "textarea" ? <textarea id={field.key} name={field.key} rows={3} disabled={!editable} value={value as string | number} onChange={onFieldChange} />
              : <input id={field.key} name={field.key} disabled={!editable} value={value as string | number} onChange={onFieldChange} type={field.kind === "money" ? "number" : field.kind} step={field.kind === "money" ? "0.01" : undefined} />}
            {field.hint && <div className="field-hint">{field.hint}</div>}
          </div>;
        })}
      </div>
    </section>)}
  </>;
}

function emptyPremiumRegister() {
  return { lines: [], totalPolicies: 0, totalSumInsured: 0, totalGrossPremium: 0, totalBrokerage: 0, totalISSLevy: 0, totalNetPremium: 0 };
}

function emptyClaimsRegister() {
  return { lines: [], totalClaims: 0, claimsNotifiedInMonth: 0, claimsSettledInMonth: 0, claimsSettled: 0, claimsRepudiated: 0, claimsOutstanding: 0, totalClaimedAmount: 0, totalIncurredAmount: 0, totalSettledAmount: 0, totalOutstandingAmount: 0, settlementRate: 0 };
}

export function StatutoryReportPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["statutory-report", reportId],
    queryFn: () => api.get<ReportResponse>(`/api/statutory-reports/${reportId}`),
    enabled: Boolean(reportId),
  });
  const report = data?.report;

  useEffect(() => { if (report) setPayload(report.payload || {}); }, [report]);

  const save = useMutation({
    mutationFn: () => api.put<ReportResponse>(`/api/statutory-reports/${reportId}`, { payload }),
    onSuccess: (result) => { setPayload(result.report.payload); setMessage("Report saved."); setError(null); queryClient.invalidateQueries({ queryKey: ["statutory-calendar"] }); },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the report."),
  });
  const refresh = useMutation({
    mutationFn: () => api.post<ReportResponse>(`/api/statutory-reports/${reportId}/refresh`),
    onSuccess: (result) => { setPayload(result.report.payload); setMessage("Report figures refreshed from the source records."); setError(null); },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not refresh the report."),
  });
  const submit = useMutation({
    mutationFn: () => api.post<ReportResponse & { filingReference?: string }>(`/api/statutory-reports/${reportId}/submit`),
    onSuccess: (result) => { setMessage(`Submitted to NAICOM. Filing reference: ${result.filingReference || "pending"}.`); setError(null); queryClient.setQueryData(["statutory-report", reportId], result); queryClient.invalidateQueries({ queryKey: ["statutory-calendar"] }); },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not submit the report."),
  });

  if (isLoading) return <div className="card">Loading statutory report...</div>;
  if (!report || !payload) return <div className="flash flash-error">This statutory report could not be found.</div>;

  const editable = isEditable(report);
  const derived = ["MPR", "MCR", "MIF", "ARR"].includes(report.report_type);
  const updateSection = (section: "premiumRegister" | "claimsRegister" | "insurerRemittances", key: string, value: string) => {
    const current = (payload[section] || {}) as Record<string, unknown>;
    setPayload({ ...payload, [section]: { ...current, [key]: value } });
  };

  return <div>
    <div className="page-header">
      <div>
        <button type="button" className="btn-link" onClick={() => navigate("/compliance/reports")}>Back to statutory reports</button>
        <p className="eyebrow">{report.report_code} · {report.report_frequency}</p>
        <h1>{report.report_title}</h1>
        <p className="page-lede">{report.period_start} to {report.period_end} · Due {report.due_date || "not set"}</p>
      </div>
      <div className="page-header-actions">
        <a className="btn-secondary" href={apiUrl(`/api/statutory-reports/${report.id}/pdf`)} download>
          Export PDF
        </a>
        <StatusBadge status={report.status} />
      </div>
    </div>
    {message && <div className="flash flash-success">{message}</div>}
    {error && <div className="flash flash-error">{error}</div>}
    <div className="card">
      <div className="field-hint">Legal basis: {report.legalBasis}</div>
      {report.report_type === "MPR" && <PremiumRegisterSection register={payload.premiumRegister || emptyPremiumRegister()} declarationText={String(payload.premiumRegister?.declarationText || "")} onDeclarationChange={(value) => updateSection("premiumRegister", "declarationText", value)} editable={editable} />}
      {report.report_type === "MCR" && <ClaimsRegisterSection register={payload.claimsRegister || emptyClaimsRegister()} remarks={String(payload.claimsRegister?.remarks || "")} onRemarksChange={(value) => updateSection("claimsRegister", "remarks", value)} editable={editable} />}
      {report.report_type === "MIF" && <>
        <div className="section-title">Insurer funds remittance</div>
        <div className="table-wrap"><table><thead><tr><th>Insurer</th><th className="num">Premium collected</th><th className="num">Remitted</th><th className="num">Outstanding</th><th>Evidence</th></tr></thead><tbody>
          {(payload.insurerRemittances?.lines || []).map((line, index) => <tr key={`${line.insurerName}-${index}`}><td>{line.insurerName || "-"}</td><td className="num">{line.premiumCollected}</td><td className="num">{line.amountRemitted}</td><td className="num">{line.outstandingBalance}</td><td>{line.evidenceReference || "-"}</td></tr>)}
          {(payload.insurerRemittances?.lines || []).length === 0 && <tr><td colSpan={5} className="empty-state">No remittance records in this period.</td></tr>}
        </tbody></table></div>
        <div className="field field-wide"><label htmlFor="mifRemarks">Remarks</label><textarea id="mifRemarks" rows={3} disabled={!editable} value={String(payload.insurerRemittances?.remarks || "")} onChange={(event) => updateSection("insurerRemittances", "remarks", event.target.value)} /></div>
      </>}
      {report.report_type === "ARR" && <ReinsuranceReturnSection payload={payload} />}
      {(!derived || report.report_type === "ARR") && <ManualFields report={report} payload={payload} editable={editable} onChange={(key, value) => setPayload({ ...payload, [key]: value })} />}
      <div className="page-header-actions" style={{ marginTop: "1.5rem" }}>
        {editable && <RoleGate need="write"><button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save report</button></RoleGate>}
        {editable && derived && <RoleGate need="write"><button type="button" className="btn-secondary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>Refresh figures</button></RoleGate>}
        {editable && <RoleGate need="write"><button type="button" className="btn-secondary" disabled={submit.isPending} onClick={() => submit.mutate()}>Submit to NAICOM</button></RoleGate>}
      </div>
    </div>
  </div>;
}