import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import type { AmlFiling, BankAccountOption, BankBalance, CorporateOfficer } from "../lib/types";

const ROLE_LABEL: Record<string, string> = { director: "Director", shareholder: "Shareholder", both: "Director & shareholder", officer: "Principal officer" };
const EMPTY_OFFICER = { name: "", role: "director", designation: "", nationality: "", shares_held: "", pct_holding: "", professional_qualification: "", appointed_on: "", ceased_on: "", notes: "" };
const EMPTY_FILING = { filing_type: "CTR", reference_no: "", receipt_id: "", transaction_date: "", filed_date: "", amount: "", grounds: "" };
type OfficerForm = typeof EMPTY_OFFICER;
type FilingForm = typeof EMPTY_FILING;

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function OfficersTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OfficerForm>(EMPTY_OFFICER);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["corporate-officers"], queryFn: () => api.get<{ officers: CorporateOfficer[] }>("/api/statutory-reports/officers") });
  const done = () => { setForm(EMPTY_OFFICER); setEditing(null); setError(null); queryClient.invalidateQueries({ queryKey: ["corporate-officers"] }); };
  const save = useMutation({
    mutationFn: () => (editing ? api.put(`/api/statutory-reports/officers/${editing}`, form) : api.post("/api/statutory-reports/officers", form)),
    onSuccess: done, onError: (err) => setError(errorText(err, "Could not save.")),
  });
  const remove = useMutation({ mutationFn: (id: number) => api.delete(`/api/statutory-reports/officers/${id}`), onSuccess: done, onError: (err) => setError(errorText(err, "Could not remove.")) });
  const officers = data?.officers || [];
  const activeShares = officers.filter((o) => !o.ceased_on && (o.role === "shareholder" || o.role === "both")).reduce((s, o) => s + Number(o.pct_holding || 0), 0);
  const set = (k: keyof OfficerForm, v: string) => setForm({ ...form, [k]: v });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return <div>
    <p className="field-hint">Directors, shareholders and principal officers, printed on the annual corporate return (AR-01). Record a departure with the date ceased rather than deleting, so the return can show the change. Current shareholdings total {activeShares.toFixed(2)}%.</p>
    {error && <div className="flash flash-error">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Name</th><th>Role</th><th>Designation</th><th className="num">% holding</th><th>Appointed</th><th>Ceased</th><th></th></tr></thead>
      <tbody>
        {officers.length === 0 && <tr><td colSpan={7} className="empty-state">No one recorded yet.</td></tr>}
        {officers.map((o) => <tr key={o.id}>
          <td data-label="Name">{o.name}{o.professional_qualification ? <div className="field-hint">{o.professional_qualification}</div> : null}</td>
          <td data-label="Role">{ROLE_LABEL[o.role]}</td><td data-label="Designation">{o.designation || "—"}</td>
          <td className="num" data-label="% holding">{o.role === "shareholder" || o.role === "both" ? `${Number(o.pct_holding).toFixed(2)}%` : "—"}</td>
          <td data-label="Appointed">{o.appointed_on || "—"}</td><td data-label="Ceased">{o.ceased_on || "—"}</td>
          <td><RoleGate need="write"><div className="page-header-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditing(o.id); setForm(Object.fromEntries(Object.keys(EMPTY_OFFICER).map((k) => [k, String((o as unknown as Record<string, unknown>)[k] ?? "")])) as OfficerForm); }}>Edit</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => { if (window.confirm(`Remove ${o.name} from the register? Use "Date ceased" instead if they have left.`)) remove.mutate(o.id); }}>Remove</button>
          </div></RoleGate></td>
        </tr>)}
      </tbody>
    </table></div>
    <RoleGate need="write">
      <form className="form-grid" style={{ marginTop: "1rem" }} onSubmit={submit}>
        <div className="field field-wide section-title">{editing ? "Edit entry" : "Add someone"}</div>
        <div className="field"><label htmlFor="of-name">Name</label><input id="of-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="of-role">Role</label><select id="of-role" value={form.role} onChange={(e) => set("role", e.target.value)}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="of-des">Designation</label><input id="of-des" value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Chairman, MD/CEO, Compliance Officer..." /></div>
        <div className="field"><label htmlFor="of-nat">Nationality</label><input id="of-nat" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
        {(form.role === "shareholder" || form.role === "both") && <>
          <div className="field"><label htmlFor="of-sh">Shares held</label><input id="of-sh" type="number" min={0} value={form.shares_held} onChange={(e) => set("shares_held", e.target.value)} /></div>
          <div className="field"><label htmlFor="of-pct">% holding</label><input id="of-pct" type="number" min={0} max={100} step="0.01" value={form.pct_holding} onChange={(e) => set("pct_holding", e.target.value)} /></div>
        </>}
        <div className="field"><label htmlFor="of-q">Professional qualification</label><input id="of-q" value={form.professional_qualification} onChange={(e) => set("professional_qualification", e.target.value)} placeholder="ACIIN, FCII..." /></div>
        <div className="field"><label htmlFor="of-ap">Date appointed</label><input id="of-ap" type="date" value={form.appointed_on} onChange={(e) => set("appointed_on", e.target.value)} /></div>
        <div className="field"><label htmlFor="of-ce">Date ceased</label><input id="of-ce" type="date" value={form.ceased_on} onChange={(e) => set("ceased_on", e.target.value)} /></div>
        <div className="field field-wide page-header-actions">
          <button type="submit" className="btn-primary" disabled={save.isPending}>{editing ? "Save changes" : "Add"}</button>
          {editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setForm(EMPTY_OFFICER); }}>Cancel</button>}
        </div>
      </form>
    </RoleGate>
  </div>;
}

function AmlTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FilingForm>(EMPTY_FILING);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["aml-filings"], queryFn: () => api.get<{ filings: AmlFiling[] }>("/api/statutory-reports/aml-filings") });
  const done = () => { setForm(EMPTY_FILING); setError(null); queryClient.invalidateQueries({ queryKey: ["aml-filings"] }); };
  const save = useMutation({ mutationFn: () => api.post("/api/statutory-reports/aml-filings", form), onSuccess: done, onError: (err) => setError(errorText(err, "Could not record the filing.")) });
  const remove = useMutation({ mutationFn: (id: number) => api.delete(`/api/statutory-reports/aml-filings/${id}`), onSuccess: done, onError: (err) => setError(errorText(err, "Could not remove.")) });
  const set = (k: keyof FilingForm, v: string) => setForm({ ...form, [k]: v });

  return <div>
    <p className="field-hint">Currency transaction reports (CTR) and suspicious transaction reports (STR) filed with the NFIU. The AML/CFT return (QR-09) flags every cash receipt at or above the CTR threshold that has no CTR here; link the CTR to its receipt number so it matches.</p>
    {error && <div className="flash flash-error">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Type</th><th>NFIU reference</th><th>Client</th><th>Transaction</th><th>Filed</th><th className="num">Amount</th><th>Grounds</th><th></th></tr></thead>
      <tbody>
        {(data?.filings || []).length === 0 && <tr><td colSpan={8} className="empty-state">No filings recorded.</td></tr>}
        {(data?.filings || []).map((f) => <tr key={f.id}>
          <td data-label="Type">{f.filing_type}</td><td data-label="Reference">{f.reference_no}</td><td data-label="Client">{f.client_name || "—"}{f.receipt_id ? <div className="field-hint">Receipt #{f.receipt_id}</div> : null}</td>
          <td data-label="Transaction">{f.transaction_date}</td><td data-label="Filed">{f.filed_date}</td><td className="num" data-label="Amount">{fmtMoney(f.amount)}</td><td data-label="Grounds">{f.grounds || "—"}</td>
          <td><RoleGate need="admin"><button type="button" className="btn-secondary btn-sm" onClick={() => { if (window.confirm("Remove this filing record?")) remove.mutate(f.id); }}>Remove</button></RoleGate></td>
        </tr>)}
      </tbody>
    </table></div>
    <RoleGate need="write">
      <form className="form-grid" style={{ marginTop: "1rem" }} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="field field-wide section-title">Record a filing</div>
        <div className="field"><label htmlFor="aml-type">Type</label><select id="aml-type" value={form.filing_type} onChange={(e) => set("filing_type", e.target.value)}><option value="CTR">CTR</option><option value="STR">STR</option></select></div>
        <div className="field"><label htmlFor="aml-ref">NFIU reference</label><input id="aml-ref" value={form.reference_no} onChange={(e) => set("reference_no", e.target.value)} /></div>
        <div className="field"><label htmlFor="aml-rc">Receipt ID</label><input id="aml-rc" inputMode="numeric" value={form.receipt_id} onChange={(e) => set("receipt_id", e.target.value)} /><div className="field-hint">The receipt's ID, from the Receipts page. Sets the client.</div></div>
        <div className="field"><label htmlFor="aml-td">Transaction date</label><input id="aml-td" type="date" value={form.transaction_date} onChange={(e) => set("transaction_date", e.target.value)} /></div>
        <div className="field"><label htmlFor="aml-fd">Date filed</label><input id="aml-fd" type="date" value={form.filed_date} onChange={(e) => set("filed_date", e.target.value)} /></div>
        <div className="field"><label htmlFor="aml-am">Amount (₦)</label><input id="aml-am" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
        <div className="field field-wide"><label htmlFor="aml-gr">Grounds{form.filing_type === "STR" ? " (required for an STR)" : ""}</label><textarea id="aml-gr" rows={2} value={form.grounds} onChange={(e) => set("grounds", e.target.value)} /></div>
        <div className="field field-wide page-header-actions"><button type="submit" className="btn-primary" disabled={save.isPending}>Record filing</button></div>
      </form>
    </RoleGate>
  </div>;
}

const KIND_LABEL: Record<string, string> = { premium: "Premium trust (client money)", claims: "Claims trust (client money, not premium)", operating: "Operating" };
const EMPTY_BALANCE = { account_id: "", as_at: "", statement_balance: "", reference: "", notes: "" };
type BalanceForm = typeof EMPTY_BALANCE;

function BankBalancesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BalanceForm>(EMPTY_BALANCE);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["bank-balances"], queryFn: () => api.get<{ balances: BankBalance[]; accounts: BankAccountOption[] }>("/api/statutory-reports/bank-balances") });
  const done = () => { setForm({ ...EMPTY_BALANCE, account_id: form.account_id }); setError(null); queryClient.invalidateQueries({ queryKey: ["bank-balances"] }); };
  const save = useMutation({ mutationFn: () => api.post("/api/statutory-reports/bank-balances", form), onSuccess: done, onError: (err) => setError(errorText(err, "Could not record the balance.")) });
  const remove = useMutation({ mutationFn: (id: number) => api.delete(`/api/statutory-reports/bank-balances/${id}`), onSuccess: done, onError: (err) => setError(errorText(err, "Could not remove.")) });
  const set = (k: keyof BalanceForm, v: string) => setForm({ ...form, [k]: v });
  const accounts = (data?.accounts || []).filter((a) => a.is_active);

  return <div>
    <p className="field-hint">The closing balance on each bank statement, by account and date. The client money return (QR-10) reconciles every bank account's cash book to its latest statement on or before the period end, and judges whether premium owed to insurers is covered on what the bank says the premium trust accounts hold. Claims trust accounts are reconciled too, but their money is held for insureds and does not count towards premium. Enter a balance for every trust account at each month end.</p>
    {error && <div className="flash flash-error">{error}</div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Account</th><th>Statement date</th><th className="num">Statement balance</th><th>Reference</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        {(data?.balances || []).length === 0 && <tr><td colSpan={6} className="empty-state">No statement balances recorded.</td></tr>}
        {(data?.balances || []).map((b) => <tr key={b.id}>
          <td data-label="Account">{b.account_code} {b.account_name}{b.kind ? <div className="field-hint">{KIND_LABEL[b.kind]}</div> : null}</td>
          <td data-label="Statement date">{b.as_at}</td><td className="num" data-label="Balance">{fmtMoney(b.statement_balance)}</td>
          <td data-label="Reference">{b.reference || "—"}</td><td data-label="Notes">{b.notes || "—"}</td>
          <td><RoleGate need="write"><button type="button" className="btn-secondary btn-sm" onClick={() => { if (window.confirm(`Remove the ${b.as_at} balance for ${b.account_code}?`)) remove.mutate(b.id); }}>Remove</button></RoleGate></td>
        </tr>)}
      </tbody>
    </table></div>
    <RoleGate need="write">
      <form className="form-grid" style={{ marginTop: "1rem" }} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="field field-wide section-title">Record a statement balance</div>
        <div className="field"><label htmlFor="bb-acc">Bank account</label><select id="bb-acc" value={form.account_id} onChange={(e) => set("account_id", e.target.value)}>
          <option value="">Choose an account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name} ({KIND_LABEL[a.kind]})</option>)}
        </select>{accounts.length === 0 && <div className="field-hint">No bank accounts found. Bank accounts are ledger accounts on the cash, premium cash or claims cash line (Settings &gt; Ledger mapping).</div>}</div>
        <div className="field"><label htmlFor="bb-date">Statement date</label><input id="bb-date" type="date" value={form.as_at} onChange={(e) => set("as_at", e.target.value)} /></div>
        <div className="field"><label htmlFor="bb-bal">Closing balance (₦)</label><input id="bb-bal" type="number" step="0.01" value={form.statement_balance} onChange={(e) => set("statement_balance", e.target.value)} /><div className="field-hint">Negative for an overdraft.</div></div>
        <div className="field"><label htmlFor="bb-ref">Statement reference</label><input id="bb-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} /></div>
        <div className="field field-wide"><label htmlFor="bb-notes">Notes (reconciling items)</label><textarea id="bb-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <div className="field field-wide page-header-actions"><button type="submit" className="btn-primary" disabled={save.isPending}>Record balance</button></div>
      </form>
    </RoleGate>
  </div>;
}

export function StatutoryRegistersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "aml" ? "aml" : params.get("tab") === "bank" ? "bank" : "officers";
  return <div>
    <div className="page-header">
      <div>
        <p className="eyebrow">Compliance</p>
        <h1>Statutory Registers</h1>
        <p className="page-lede">Records the NAICOM returns need that the rest of the ERP does not keep: the board and shareholders, AML filings with the NFIU, and bank statement balances for the client money reconciliation.</p>
      </div>
      <div className="page-header-actions"><Link className="btn-secondary" to="/compliance/returns">Returns workbench</Link></div>
    </div>
    <div className="toolbar" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "officers"} className={tab === "officers" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setParams({ tab: "officers" })}>Board & shareholders</button>
      <button type="button" role="tab" aria-selected={tab === "aml"} className={tab === "aml" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setParams({ tab: "aml" })}>AML filings (CTR / STR)</button>
      <button type="button" role="tab" aria-selected={tab === "bank"} className={tab === "bank" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setParams({ tab: "bank" })}>Bank balances</button>
    </div>
    <div className="card">{tab === "officers" ? <OfficersTab /> : tab === "aml" ? <AmlTab /> : <BankBalancesTab />}</div>
  </div>;
}
