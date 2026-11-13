import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { errorText, useReinsuranceStatus, type Party } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

interface Policy { id: number; policy_no: string | null; client_name: string; insurer_name: string; class_of_business: string | null; sum_insured: number; start_date: string | null; end_date: string | null }

// Start a facultative placement from a policy (the cedant, exposure and period are
// read from it) or as a standalone risk.
export function PlacementNewPage() {
  const navigate = useNavigate();
  const { can, isLoading } = useReinsuranceStatus();
  const [search, setSearch] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    cedant_party_id: "", fac_type: "Proportional", document_type: "Slip", currency: "NGN", sum_insured: "", cedant_retention: "", pml: "", mfl: "",
    class_of_business: "", original_insured: "", risk_description: "", location: "", period_start: "", period_end: "", order_percent: "100",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const policies = useQuery({
    queryKey: ["ri", "policy-search", search],
    queryFn: () => api.get<{ transactions: Policy[] }>(`/api/transactions?q=${encodeURIComponent(search)}&limit=8`),
    enabled: search.trim().length >= 2 && !policy,
  });
  const cedants = useQuery({
    queryKey: ["ri", "cedants"],
    queryFn: () => api.get<{ rows: Party[] }>("/api/reinsurance/parties?type=Cedant&limit=200"),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const order = Math.round(Number(form.order_percent) * 100);
    if (!Number.isFinite(order) || order <= 0 || order > 10000) return setError("Order must be above 0% and at most 100%.");
    const body: Record<string, unknown> = { ...form, order_bps: order };
    delete body.order_percent;
    if (policy) body.transaction_id = policy.id;
    for (const k of Object.keys(body)) if (body[k] === "") delete body[k];
    setBusy(true);
    try {
      const res = await api.post<{ placementId: number }>("/api/reinsurance/placements/fac", body);
      navigate(`/reinsurance/placements/${res.placementId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isLoading && !can("ri.placement.edit")) return <div className="flash flash-error">You don't have permission to create placements.</div>;
  const input = (label: string, key: keyof typeof form, opts: { type?: string; hint?: string; span?: string } = {}) => (
    <div className={`field${opts.span ? ` ${opts.span}` : ""}`}>
      <label htmlFor={key}>{label}</label>
      <input id={key} type={opts.type || "text"} value={form[key]} onChange={set(key)} />
      {opts.hint && <small className="muted">{opts.hint}</small>}
    </div>
  );

  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>New facultative placement</h1></div>
        <div className="page-header-actions"><Link className="btn-secondary btn" to="/reinsurance/placements">Back</Link></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      <form onSubmit={submit} noValidate>
        <div className="card">
          <h2>Underlying policy (optional)</h2>
          {policy ? (
            <p>
              <strong>{policy.policy_no || "No policy no."}</strong> · {policy.client_name} · {policy.insurer_name}{" "}
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => setPolicy(null)}>Change</button>
              <br /><span className="ri-note">The cedant, insured, class, sum insured and period are read from this policy unless you enter them below. Nothing is written to the policy.</span>
            </p>
          ) : (
            <>
              <div className="field"><label htmlFor="policy-search">Find a policy</label>
                <input id="policy-search" type="search" placeholder="Policy no., client or insurer" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              {(policies.data?.transactions ?? []).map((p) => (
                <div key={p.id}><button type="button" className="btn-secondary btn btn-sm" onClick={() => setPolicy(p)}>
                  {p.policy_no || "—"} · {p.client_name} · {p.insurer_name} · {p.class_of_business || "—"}</button></div>
              ))}
              <p className="ri-note">Or leave blank for a standalone risk.</p>
            </>
          )}
        </div>
        <div className="card">
          <h2>Risk and cover</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="cedant_party_id">Cedant{policy ? " (from the policy's insurer if blank)" : " *"}</label>
              <select id="cedant_party_id" value={form.cedant_party_id} onChange={set("cedant_party_id")}>
                <option value="">{policy ? "Use the policy's insurer" : "Choose…"}</option>
                {(cedants.data?.rows ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field"><label htmlFor="fac_type">Type</label>
              <select id="fac_type" value={form.fac_type} onChange={set("fac_type")}>{["Proportional", "Non-Proportional", "Obligatory"].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label htmlFor="document_type">Issue as</label>
              <select id="document_type" value={form.document_type} onChange={set("document_type")}><option>Slip</option><option>Certificate</option></select></div>
            <div className="field"><label htmlFor="currency">Currency</label>
              <select id="currency" value={form.currency} onChange={set("currency")}>{["NGN", "USD", "EUR", "GBP"].map((t) => <option key={t}>{t}</option>)}</select></div>
            {input("Sum insured (100%)", "sum_insured", { hint: policy ? "Blank = the policy's sum insured" : undefined })}
            {input("Cedant's retention", "cedant_retention")}
            {input("PML", "pml")}
            {input("MFL", "mfl")}
            {input("Original insured", "original_insured")}
            {input("Class of business", "class_of_business")}
            {input("Location", "location")}
            {input("Period start", "period_start", { type: "date" })}
            {input("Period end", "period_end", { type: "date" })}
            {input("Order (% of the risk)", "order_percent", { hint: "Normally 100" })}
            <div className="field span-2"><label htmlFor="risk_description">Risk description</label>
              <textarea id="risk_description" rows={3} value={form.risk_description} onChange={set("risk_description")} /></div>
          </div>
          <p className="ri-note">Amounts are plain numbers in the chosen currency, for example 1500000000 or 1,500,000,000.50. Fac required is worked out for you from the retention and treaty capacity.</p>
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create placement"}</button>
      </form>
    </div>
  );
}
