import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { ReturnView } from "../components/ReturnView";
import type { CatalogResponse, ReturnOutput } from "../lib/types";

const FREQUENCY_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", "half-yearly": "Half-yearly", annual: "Annual" };

function periodChoices(frequency: string): { value: number; label: string }[] {
  if (frequency === "monthly") return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(Date.UTC(2000, i, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) }));
  if (frequency === "quarterly") return [1, 2, 3, 4].map((q) => ({ value: q, label: `Quarter ${q}` }));
  if (frequency === "half-yearly") return [{ value: 1, label: "First half (Jan-Jun)" }, { value: 2, label: "Second half (Jul-Dec)" }];
  return [{ value: 1, label: "Full year" }];
}

// The Returns workbench: work out any of the 14 NAICOM returns from the ERP's records for any period, read
// its findings, and download it. Nothing is saved here; a return is filed through its statutory filing on the
// calendar page, which carries the same schedules through review and approval.
export function NaicomReturnsPage() {
  const [params, setParams] = useSearchParams();
  const thisYear = new Date().getFullYear();
  const code = params.get("code") || "QR-03";
  const frequency = params.get("frequency") || "quarterly";
  const year = Number(params.get("year")) || thisYear;
  const index = Number(params.get("index")) || 1;
  const [error, setError] = useState<string | null>(null);

  const { data: catalog } = useQuery({ queryKey: ["naicom-returns-catalog"], queryFn: () => api.get<CatalogResponse>("/api/statutory-reports/returns/catalog") });
  const current = catalog?.returns.find((r) => r.code === code);
  const frequencies = current?.frequencies || [];
  const effectiveFrequency = frequencies.includes(frequency) ? frequency : frequencies[0] || frequency;

  const preview = useMutation({
    mutationFn: () => api.post<ReturnOutput>(`/api/statutory-reports/returns/${encodeURIComponent(code)}/preview`, { frequency: effectiveFrequency, year, index }),
    onSuccess: () => setError(null),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not work out the return."),
  });

  const set = (next: Record<string, string | number>) => {
    const merged = { code, frequency: effectiveFrequency, year: String(year), index: String(index), ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])) };
    setParams(merged);
    preview.reset();
  };

  const grouped = useMemo(() => {
    const out = new Map<string, CatalogResponse["returns"]>();
    for (const r of catalog?.returns || []) out.set(r.category, [...(out.get(r.category) || []), r]);
    return [...out.entries()];
  }, [catalog]);

  const exportHref = (format: string) => apiUrl(`/api/statutory-reports/returns/${encodeURIComponent(code)}/export/${format}?frequency=${encodeURIComponent(effectiveFrequency)}&year=${year}&index=${index}`);
  const result = preview.data;

  return <div>
    <div className="page-header">
      <div>
        <p className="eyebrow">Compliance</p>
        <h1>NAICOM Returns Workbench</h1>
        <p className="page-lede">Work out any NAICOM return from the ERP's own records for any period, check its findings and download it. Nothing here is filed: file a return through its filing on the <Link to="/compliance/reports">statutory calendar</Link>, which carries these schedules through review and approval.</p>
      </div>
      <div className="page-header-actions">
        <Link className="btn-secondary" to="/compliance/statutory-settings">Settings</Link>
        <Link className="btn-secondary" to="/compliance/statutory-registers">Registers</Link>
      </div>
    </div>

    <div className="card">
      <div className="form-grid">
        <div className="field field-wide">
          <label htmlFor="returnCode">Return</label>
          <select id="returnCode" value={code} onChange={(e) => set({ code: e.target.value })}>
            {grouped.map(([category, items]) => <optgroup key={category} label={category}>
              {items.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
            </optgroup>)}
          </select>
          {current && <div className="field-hint">{current.description}</div>}
        </div>
        <div className="field">
          <label htmlFor="returnFrequency">Frequency</label>
          <select id="returnFrequency" value={effectiveFrequency} onChange={(e) => set({ frequency: e.target.value, index: 1 })}>
            {frequencies.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f] || f}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="returnYear">Year</label>
          <select id="returnYear" value={year} onChange={(e) => set({ year: e.target.value })}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="returnPeriod">Period</label>
          <select id="returnPeriod" value={index} onChange={(e) => set({ index: e.target.value })} disabled={effectiveFrequency === "annual"}>
            {periodChoices(effectiveFrequency).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div className="page-header-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn-primary" disabled={preview.isPending || !current} onClick={() => preview.mutate()}>{preview.isPending ? "Working it out..." : "Preview return"}</button>
        <a className="btn-secondary" href={exportHref("xlsx")} download>Download Excel</a>
        <a className="btn-secondary" href={exportHref("pdf")} download>Download PDF</a>
      </div>
    </div>

    {error && <div className="flash flash-error">{error}</div>}
    {result && <div className="card">
      <h2>{result.code} · {result.name}</h2>
      <div className="field-hint">{result.counts.error} error(s), {result.counts.warning} warning(s), {result.counts.info} note(s)</div>
      <ReturnView output={result} />
    </div>}
  </div>;
}
