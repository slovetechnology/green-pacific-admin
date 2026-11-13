import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { errorText, useReinsuranceStatus, type Party, type PartyDetail } from "../lib/reinsurance";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import "@/shared/styles/reinsurance.css";

interface Meta {
  partyTypes: string[]; partyStatuses: string[]; marketCategories: string[]; kycStatuses: string[]; sanctionsStatuses: string[];
  ratingAgencies: string[]; outlooks: string[]; currencies: { code: string }[];
}
const useMeta = () => useQuery({ queryKey: ["ri", "meta"], queryFn: () => api.get<Meta>("/api/reinsurance/meta") });

// Parties: reinsurers, cedants, retrocessionaires, co-brokers and direct clients.
export function PartiesListPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const meta = useMeta();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ party_type: "Reinsurer", name: "", country: "", market_category: "", licence_no: "" });
  const type = params.get("type") || "";
  const q = params.get("q") || "";
  const list = useQuery({
    queryKey: ["ri", "parties", type, q],
    queryFn: () => api.get<{ rows: Party[]; total: number }>(`/api/reinsurance/parties?limit=200${type ? `&type=${type}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    enabled: can("ri.view"),
  });
  const create = useMutation({
    mutationFn: () => api.post("/api/reinsurance/parties", { ...form, market_category: form.market_category || undefined }),
    onSuccess: () => { setAdding(false); setError(null); setForm((f) => ({ ...f, name: "", country: "", licence_no: "" })); qc.invalidateQueries({ queryKey: ["ri"] }); },
    onError: (e) => setError(errorText(e)),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const update = (next: Record<string, string>) => { const m = { type, q, ...next }; for (const k of Object.keys(m)) if (!(m as Record<string, string>)[k]) delete (m as Record<string, string>)[k]; setParams(m as Record<string, string>); };
  if (!can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Reinsurers and other parties</h1></div>
        <div className="page-header-actions">{can("ri.party.edit") && <button type="button" className="btn" onClick={() => setAdding((a) => !a)}>+ New party</button>}</div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {adding && (
        <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
          <div className="form-grid">
            <div className="field"><label htmlFor="p-type">Type</label><select id="p-type" value={form.party_type} onChange={set("party_type")}>{(meta.data?.partyTypes ?? []).map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field span-2"><label htmlFor="p-name">Name</label><input id="p-name" value={form.name} onChange={set("name")} /></div>
            <div className="field"><label htmlFor="p-country">Country</label><input id="p-country" value={form.country} onChange={set("country")} /></div>
            <div className="field"><label htmlFor="p-mkt">Market</label><select id="p-mkt" value={form.market_category} onChange={set("market_category")}><option value="">—</option>{(meta.data?.marketCategories ?? []).map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label htmlFor="p-lic">Licence no.</label><input id="p-lic" value={form.licence_no} onChange={set("licence_no")} /></div>
          </div>
          <button className="btn btn-sm" type="submit" disabled={!form.name || create.isPending}>Create</button>
        </form>
      )}
      <div className="toolbar">
        <select aria-label="Type" value={type} onChange={(e) => update({ type: e.target.value })}><option value="">All types</option>{(meta.data?.partyTypes ?? []).map((t) => <option key={t}>{t}</option>)}</select>
        <input type="search" placeholder="Search name or reference" defaultValue={q} onKeyDown={(e) => { if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value }); }} />
      </div>
      <div className="card"><div className="table-wrap"><table className="data-table">
        <thead><tr><th>Reference</th><th>Name</th><th>Type</th><th>Market</th><th>Status</th><th>KYC</th><th>Sanctions</th></tr></thead>
        <tbody>{!list.data?.rows.length && <tr><td colSpan={7}>{list.isLoading ? "Loading…" : "No parties yet."}</td></tr>}
          {(list.data?.rows ?? []).map((p) => <tr key={p.id}><td><Link to={`/reinsurance/parties/${p.id}`}>{p.reference_no}</Link></td><td>{p.name}<div className="ri-note">{p.country || ""}</div></td><td>{p.party_type}</td>
            <td>{p.market_category || "—"}</td><td><StatusBadge status={p.status} /></td><td>{p.kyc_status}{p.kyc_expiry ? ` to ${p.kyc_expiry}` : ""}</td><td><StatusBadge status={p.sanctions_status} /></td></tr>)}</tbody></table></div></div>
    </div>
  );
}

export function PartyDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const meta = useMeta();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rating, setRating] = useState({ agency: "AM Best", rating: "", outlook: "", rating_date: "" });
  const [contact, setContact] = useState({ name: "", role: "", email: "", phone: "" });
  const [bank, setBank] = useState({ currency: "USD", bank_name: "", account_name: "", account_number: "", swift_bic: "" });
  const [kyc, setKyc] = useState({ kyc_status: "Verified", kyc_expiry: "" });
  const [reason, setReason] = useState("");
  const q = useQuery({ queryKey: ["ri", "party", id], queryFn: () => api.get<{ party: PartyDetail }>(`/api/reinsurance/parties/${id}`) });
  const p = q.data?.party;
  const act = async (done: string, fn: () => Promise<unknown>) => {
    setError(null); setOk(null);
    try { await fn(); setOk(done); } catch (e) { setError(errorText(e)); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  };
  if (q.isLoading) return <p>Loading…</p>;
  if (!p) return <div className="flash flash-error">{errorText(q.error) || "Party not found."}</div>;
  const compliance = can("ri.party.kyc");
  const base = `/api/reinsurance/parties/${p.id}`;
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow"><Link to="/reinsurance/parties">Reinsurance parties</Link> · {p.party_type}</p>
        <h1>{p.name} <StatusBadge status={p.status} /></h1><p className="ri-note">{p.reference_no}{p.country ? ` · ${p.country}` : ""}{p.market_category ? ` · ${p.market_category}` : ""}</p></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {ok && <div className="flash flash-success">{ok}</div>}
      <div className={`flash flash-${p.bindability.ok ? "success" : "warning"}`}>
        {p.bindability.ok ? "Can be bound: KYC verified and in date, sanctions clear." : <>Can't be bound yet:<ul>{p.bindability.blockers.map((b) => <li key={b}>{b}</li>)}</ul></>}
        {p.bindability.warnings.map((w) => <div key={w}>Warning: {w}</div>)}
      </div>

      <div className="card"><h2>Compliance</h2>
        <div className="detail-grid"><div><div className="k">KYC</div><div className="v">{p.kyc_status}{p.kyc_expiry ? ` until ${p.kyc_expiry}` : ""}</div></div>
          <div><div className="k">Sanctions</div><div className="v">{p.sanctions_status}</div></div>
          <div><div className="k">Licence</div><div className="v">{p.licence_no || "—"}{p.licence_expiry ? ` (expires ${p.licence_expiry})` : ""}</div></div>
          <div><div className="k">Blocked reason</div><div className="v">{p.blocked_reason || "—"}</div></div></div>
        {compliance && (
          <div className="ri-inline">
            <div className="field"><label htmlFor="k-s">KYC</label><select id="k-s" value={kyc.kyc_status} onChange={(e) => setKyc((k) => ({ ...k, kyc_status: e.target.value }))}>{(meta.data?.kycStatuses ?? []).map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="k-e">Expiry</label><input id="k-e" type="date" value={kyc.kyc_expiry} onChange={(e) => setKyc((k) => ({ ...k, kyc_expiry: e.target.value }))} /></div>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("KYC updated.", () => api.put(`${base}/kyc`, kyc))}>Save KYC</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Sanctions marked clear.", () => api.put(`${base}/sanctions`, { sanctions_status: "Clear" }))}>Sanctions clear</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Sanctions flagged.", () => api.put(`${base}/sanctions`, { sanctions_status: "Flagged" }))}>Flag</button>
            <button type="button" className="btn btn-sm" onClick={() => act("Party approved.", () => api.put(`${base}/status`, { status: "Approved" }))}>Approve party</button>
            <div className="field"><label htmlFor="b-r">Reason to block</label><input id="b-r" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <button type="button" className="btn-secondary btn btn-sm" disabled={!reason} onClick={() => act("Party blocked.", () => api.put(`${base}/status`, { status: "Blocked", reason }))}>Block</button>
          </div>
        )}
      </div>

      <div className="card"><h2>Security ratings</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Agency</th><th>Rating</th><th>Outlook</th><th>Rated on</th><th /></tr></thead>
          <tbody>{!p.ratings.length && <tr><td colSpan={5}>Not rated on file.</td></tr>}
            {p.ratings.map((r) => <tr key={r.id}><td>{r.agency}</td><td>{r.rating}</td><td>{r.outlook || "—"}</td><td>{r.rating_date}</td><td>{r.is_current ? "Current" : "History"}</td></tr>)}</tbody></table></div>
        {can("ri.party.edit") && (
          <div className="ri-inline">
            <div className="field"><label htmlFor="r-a">Agency</label><select id="r-a" value={rating.agency} onChange={(e) => setRating((r) => ({ ...r, agency: e.target.value }))}>{(meta.data?.ratingAgencies ?? []).map((a) => <option key={a}>{a}</option>)}</select></div>
            <div className="field"><label htmlFor="r-r">Rating</label><input id="r-r" value={rating.rating} onChange={(e) => setRating((r) => ({ ...r, rating: e.target.value }))} /></div>
            <div className="field"><label htmlFor="r-o">Outlook</label><select id="r-o" value={rating.outlook} onChange={(e) => setRating((r) => ({ ...r, outlook: e.target.value }))}><option value="">—</option>{(meta.data?.outlooks ?? []).map((a) => <option key={a}>{a}</option>)}</select></div>
            <div className="field"><label htmlFor="r-d">Rating date</label><input id="r-d" type="date" value={rating.rating_date} onChange={(e) => setRating((r) => ({ ...r, rating_date: e.target.value }))} /></div>
            <button type="button" className="btn btn-sm" onClick={() => act("Rating added.", () => api.post(`${base}/ratings`, { ...rating, outlook: rating.outlook || undefined }))}>Add rating</button>
          </div>
        )}
      </div>

      <div className="card"><h2>Contacts</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead>
          <tbody>{!p.contacts.length && <tr><td colSpan={4}>No contacts.</td></tr>}{p.contacts.map((c) => <tr key={c.id}><td>{c.name}{c.is_primary ? " (primary)" : ""}</td><td>{c.role || "—"}</td><td>{c.email || "—"}</td><td>{c.phone || "—"}</td></tr>)}</tbody></table></div>
        {can("ri.party.edit") && (
          <div className="ri-inline">
            {(["name", "role", "email", "phone"] as const).map((k) => <div className="field" key={k}><label htmlFor={`c-${k}`}>{k[0].toUpperCase() + k.slice(1)}</label><input id={`c-${k}`} value={contact[k]} onChange={(e) => setContact((c) => ({ ...c, [k]: e.target.value }))} /></div>)}
            <button type="button" className="btn btn-sm" disabled={!contact.name} onClick={() => act("Contact added.", () => api.post(`${base}/contacts`, { ...contact, is_primary: !p.contacts.length }).then(() => setContact({ name: "", role: "", email: "", phone: "" })))}>Add contact</button>
          </div>
        )}
      </div>

      <div className="card"><h2>Settlement bank accounts</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Currency</th><th>Bank</th><th>Account name</th><th>Account number</th><th>SWIFT</th><th>Status</th></tr></thead>
          <tbody>{!p.bankAccounts.length && <tr><td colSpan={6}>None on file.</td></tr>}
            {p.bankAccounts.map((b) => <tr key={b.id}><td>{b.currency}</td><td>{b.bank_name}</td><td>{b.account_name}</td><td>{b.account_number}</td><td>{b.swift_bic || "—"}</td>
              <td>{b.status}{can("ri.bank.edit") && b.status === "Active" && <> <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Account retired.", () => api.delete(`/api/reinsurance/bank-accounts/${b.id}`))}>Retire</button></>}</td></tr>)}</tbody></table></div>
        {p.bankAccounts.some((b) => b.masked) && <p className="ri-note">Account numbers are masked unless your role includes bank details.</p>}
        {can("ri.bank.edit") && (
          <div className="ri-inline">
            <div className="field"><label htmlFor="bk-c">Currency</label><select id="bk-c" value={bank.currency} onChange={(e) => setBank((b) => ({ ...b, currency: e.target.value }))}>{(meta.data?.currencies ?? []).map((c) => <option key={c.code}>{c.code}</option>)}</select></div>
            {(["bank_name", "account_name", "account_number", "swift_bic"] as const).map((k) => <div className="field" key={k}><label htmlFor={`bk-${k}`}>{k.replace("_", " ")}</label><input id={`bk-${k}`} value={bank[k]} onChange={(e) => setBank((b) => ({ ...b, [k]: e.target.value }))} /></div>)}
            <button type="button" className="btn btn-sm" onClick={() => act("Bank account added.", () => api.post(`${base}/bank-accounts`, bank))}>Add account</button>
          </div>
        )}
      </div>
      <AttachmentsPanel ownerType="party" ownerId={p.id} canUpload={can("ri.party.edit")} />
    </div>
  );
}
