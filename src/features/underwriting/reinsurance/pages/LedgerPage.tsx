import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { errorText, minorText, useReinsuranceStatus } from "../lib/reinsurance";
import "@/shared/styles/executive.css";
import "@/shared/styles/reinsurance.css";

interface Trial { rows: { code: string; name: string; account_type: string; client_money: number; debit_minor: number; credit_minor: number; balance_minor: number }[]; debit_minor: number; credit_minor: number; balanced: boolean }
interface Journal { id: number; journal_no: string; entry_date: string; currency: string; event_type: string; description: string; total_minor: number; posted_by: string; approved_by: string | null }
interface JournalDetail extends Journal { lines: { id: number; role: string; account_code: string; account_name: string; debit_minor: number; credit_minor: number; party_name: string | null; memo: string | null }[]; reversed_by: { id: number; journal_no: string } | null; fx_rate_micro: number | null }
interface Mapping { id: number; role: string; account_code: string; account_name: string; effective_from: string; effective_to: string | null; status: string; proposed_by: string; note: string | null }
interface Account { code: string; name: string; account_type: string; client_money: number; is_active: number }
interface Meta { ledgerRoles: string[]; accountTypes: string[] }

const roleText = (r: string) => r.replace(/_/g, " ").toLowerCase();

// The ledger kept inside the module: trial balance, journals, which account each role posts to, the
// chart of accounts, manual journals, and the bank balance used for reconciliation.
export function LedgerPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can, isLoading } = useReinsuranceStatus();
  const [tab, setTab] = useState("trial");
  const [currency, setCurrency] = useState("NGN");
  const [open, setOpen] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [map, setMap] = useState({ role: "FEE_INCOME", account_code: "", effective_from: "", note: "" });
  const [acct, setAcct] = useState({ code: "", name: "", account_type: "Expense", client_money: false });
  const [bank, setBank] = useState({ currency: "NGN", statement_date: "", closing_balance: "", note: "" });
  const [mj, setMj] = useState({ entry_date: "", description: "", currency: "NGN", lines: [{ role: "HOUSE_BANK", side: "debit", amount: "" }, { role: "FEE_INCOME", side: "credit", amount: "" }] });
  const on = can("ri.view");
  const meta = useQuery({ queryKey: ["ri", "acct-meta"], queryFn: () => api.get<Meta>("/api/reinsurance/accounting-meta"), enabled: on });
  const trial = useQuery({ queryKey: ["ri", "trial", currency], queryFn: () => api.get<Trial>(`/api/reinsurance/ledger/trial-balance?currency=${currency}`), enabled: on && tab === "trial" });
  const journals = useQuery({ queryKey: ["ri", "journals", currency], queryFn: () => api.get<{ rows: Journal[]; total: number }>(`/api/reinsurance/ledger/journals?currency=${currency}&limit=50`), enabled: on && tab === "journals" });
  const detail = useQuery({ queryKey: ["ri", "journal", open], queryFn: () => api.get<{ journal: JournalDetail }>(`/api/reinsurance/ledger/journals/${open}`), enabled: open !== null });
  const maps = useQuery({ queryKey: ["ri", "mappings"], queryFn: () => api.get<{ mappings: Mapping[] }>("/api/reinsurance/ledger/mappings"), enabled: on && tab === "mappings" });
  const accts = useQuery({ queryKey: ["ri", "gl-accounts"], queryFn: () => api.get<{ accounts: Account[] }>("/api/reinsurance/ledger/accounts"), enabled: on && ["mappings", "chart"].includes(tab) });
  const banks = useQuery({ queryKey: ["ri", "bank"], queryFn: () => api.get<{ statements: { id: number; currency: string; statement_date: string; closing_balance_minor: number; entered_by: string; note: string | null }[] }>("/api/reinsurance/accounting/bank-statements"), enabled: on && tab === "bank" });
  const verify = useQuery({ queryKey: ["ri", "verify"], queryFn: () => api.get<{ ok: boolean; problems: unknown[] }>("/api/reinsurance/ledger/verify"), enabled: on && tab === "trial" });
  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (!isLoading && !on) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const tabs: TabDef[] = [{ id: "trial", label: "Trial balance" }, { id: "journals", label: "Journals" }, { id: "mappings", label: "Accounts for each role" }, { id: "chart", label: "Chart of accounts" }, { id: "manual", label: "Manual journal" }, { id: "bank", label: "Bank" }];
  const money = (n: number) => minorText(n, currency);
  const mjDebit = mj.lines.reduce((s, l) => s + (l.side === "debit" && l.amount ? Number(l.amount.replace(/,/g, "")) : 0), 0);
  const mjCredit = mj.lines.reduce((s, l) => s + (l.side === "credit" && l.amount ? Number(l.amount.replace(/,/g, "")) : 0), 0);
  const toMinor = (text: string) => Math.round(Number(text.replace(/,/g, "")) * 100);

  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Ledger</h1></div>
        <div className="page-header-actions"><select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>{["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div></div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      <p className="ri-note">A small double-entry ledger for client money, premium and claims, and brokerage income. Entries post to roles (for example "client money bank"), and the account each role uses can be changed later, so a fuller general ledger can be brought in without changing how the system posts. Entries are permanent; a mistake is corrected by a reversing entry.</p>
      <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="gl" label="Ledger sections" />
      <div role="tabpanel" id={`gl-panel-${tab}`} aria-labelledby={`gl-tab-${tab}`} tabIndex={0} className="exec-tabpanel">
        {tab === "trial" && (
          <div className="card"><h2>Trial balance ({currency})</h2>
            {trial.data && <p>{trial.data.balanced ? <StatusBadge status="Reconciled" /> : <StatusBadge status="Variance" />} Total debits {money(trial.data.debit_minor)}, credits {money(trial.data.credit_minor)}. {verify.data && (verify.data.ok ? "Every journal adds up." : `${verify.data.problems.length} journal(s) don't add up.`)}</p>}
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Type</th><th className="ri-num">Debits</th><th className="ri-num">Credits</th><th className="ri-num">Balance</th></tr></thead>
              <tbody>{(trial.data?.rows ?? []).map((r) => <tr key={r.code}><td>{r.code} {r.name}{r.client_money ? <span className="badge badge-secondary"> client money</span> : null}</td><td>{r.account_type}</td><td className="ri-num">{money(r.debit_minor)}</td><td className="ri-num">{money(r.credit_minor)}</td><td className="ri-num"><strong>{money(r.balance_minor)}</strong></td></tr>)}</tbody></table></div>
          </div>
        )}
        {tab === "journals" && (
          <div className="card"><h2>Journals ({currency})</h2>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>No.</th><th>Date</th><th>Event</th><th>Description</th><th className="ri-num">Amount</th><th>By</th></tr></thead>
              <tbody>{!journals.data?.rows.length && <tr><td colSpan={6}>No journals in {currency}.</td></tr>}
                {(journals.data?.rows ?? []).map((j) => (
                  <tr key={j.id} onClick={() => setOpen(open === j.id ? null : j.id)} style={{ cursor: "pointer" }}>
                    <td><button type="button" className="btn-secondary btn btn-sm" aria-expanded={open === j.id}>{j.journal_no}</button></td><td>{j.entry_date}</td><td>{j.event_type.replace(/_/g, " ").toLowerCase()}</td><td>{j.description}</td><td className="ri-num">{money(j.total_minor)}</td><td>{j.posted_by}{j.approved_by ? ` / ${j.approved_by}` : ""}</td></tr>))}</tbody></table></div>
            {open !== null && detail.data && (
              <div className="card" style={{ marginTop: "0.75rem" }}>
                <h3>{detail.data.journal.journal_no}{detail.data.journal.reversed_by ? ` (reversed by ${detail.data.journal.reversed_by.journal_no})` : ""}</h3>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Role</th><th>Party</th><th className="ri-num">Debit</th><th className="ri-num">Credit</th></tr></thead>
                  <tbody>{detail.data.journal.lines.map((l) => <tr key={l.id}><td>{l.account_code} {l.account_name}</td><td>{roleText(l.role)}</td><td>{l.party_name || "—"}</td><td className="ri-num">{l.debit_minor ? money(l.debit_minor) : ""}</td><td className="ri-num">{l.credit_minor ? money(l.credit_minor) : ""}</td></tr>)}</tbody></table></div>
                {detail.data.journal.fx_rate_micro && <p className="ri-note">NGN per {currency} on the entry date: {(detail.data.journal.fx_rate_micro / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 })} (CBN).</p>}
              </div>
            )}
          </div>
        )}
        {tab === "mappings" && (
          <div className="card"><h2>Which account each role posts to</h2>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Role</th><th>Account</th><th>From</th><th>To</th><th>Status</th><th /></tr></thead>
              <tbody>{(maps.data?.mappings ?? []).map((m) => <tr key={m.id}><td>{roleText(m.role)}</td><td>{m.account_code} {m.account_name}</td><td>{m.effective_from}</td><td>{m.effective_to || "—"}</td><td><StatusBadge status={m.status} /></td>
                <td>{m.status === "Pending" && (m.proposed_by === user?.username ? <span className="muted">Needs another person</span> : can("ri.rules.approve") && <><button type="button" className="btn btn-sm" onClick={() => run("Mapping approved.", () => api.post(`/api/reinsurance/ledger/mappings/${m.id}/decision`, { approve: true }))}>Approve</button>{" "}
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Mapping rejected.", () => api.post(`/api/reinsurance/ledger/mappings/${m.id}/decision`, { approve: false }))}>Reject</button></>)}</td></tr>)}</tbody></table></div>
            {can("ri.rules.propose") && (
              <form onSubmit={(e) => { e.preventDefault(); run("Change proposed. A second person must approve it.", () => api.post("/api/reinsurance/ledger/mappings", map)); }}>
                <h3>Propose a change</h3>
                <div className="ri-inline">
                  <div className="field"><label htmlFor="m-role">Role</label><select id="m-role" value={map.role} onChange={(e) => setMap({ ...map, role: e.target.value })}>{(meta.data?.ledgerRoles ?? []).map((r) => <option key={r} value={r}>{roleText(r)}</option>)}</select></div>
                  <div className="field"><label htmlFor="m-acct">New account</label><select id="m-acct" value={map.account_code} onChange={(e) => setMap({ ...map, account_code: e.target.value })}><option value="">Choose…</option>{(accts.data?.accounts ?? []).filter((a) => a.is_active).map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></div>
                  <div className="field"><label htmlFor="m-from">Effective from</label><input id="m-from" type="date" value={map.effective_from} onChange={(e) => setMap({ ...map, effective_from: e.target.value })} /></div>
                  <button className="btn btn-sm" type="submit" disabled={!map.account_code || !map.effective_from}>Propose</button>
                </div>
              </form>
            )}
          </div>
        )}
        {tab === "chart" && (
          <div className="card"><h2>Chart of accounts</h2>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Client money</th><th>Active</th></tr></thead>
              <tbody>{(accts.data?.accounts ?? []).map((a) => <tr key={a.code}><td>{a.code}</td><td>{a.name}</td><td>{a.account_type}</td><td>{a.client_money ? "Yes" : "No"}</td><td>{a.is_active ? "Yes" : "No"}{user?.isAdmin && <> <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Account updated.", () => api.put(`/api/reinsurance/ledger/accounts/${a.code}/active`, { active: !a.is_active }))}>{a.is_active ? "Deactivate" : "Reactivate"}</button></>}</td></tr>)}</tbody></table></div>
            {user?.isAdmin && (
              <form onSubmit={(e) => { e.preventDefault(); run("Account added.", () => api.post("/api/reinsurance/ledger/accounts", acct).then(() => setAcct({ ...acct, code: "", name: "" }))); }}>
                <div className="ri-inline">
                  <div className="field"><label htmlFor="a-code">Code</label><input id="a-code" value={acct.code} onChange={(e) => setAcct({ ...acct, code: e.target.value })} /></div>
                  <div className="field"><label htmlFor="a-name">Name</label><input id="a-name" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} /></div>
                  <div className="field"><label htmlFor="a-type">Type</label><select id="a-type" value={acct.account_type} onChange={(e) => setAcct({ ...acct, account_type: e.target.value })}>{(meta.data?.accountTypes ?? []).map((t) => <option key={t}>{t}</option>)}</select></div>
                  <div className="field"><label htmlFor="a-cm"><input id="a-cm" type="checkbox" checked={acct.client_money} onChange={(e) => setAcct({ ...acct, client_money: e.target.checked })} /> Client money</label></div>
                  <button className="btn btn-sm" type="submit" disabled={!acct.code || !acct.name}>Add account</button>
                </div>
              </form>
            )}
          </div>
        )}
        {tab === "manual" && (
          <div className="card"><h2>Manual journal</h2>
            <p className="ri-note">For fee income and corrections that no document produces. A second person approves it before it posts. Use a reversing entry rather than changing a posted one.</p>
            {can("ri.accounts.post") ? (
              <form onSubmit={(e) => { e.preventDefault(); run("Journal requested. A second person must approve it.", () => api.post("/api/reinsurance/ledger/manual-journals", {
                entry_date: mj.entry_date, description: mj.description, currency: mj.currency,
                lines: mj.lines.filter((l) => l.amount).map((l) => ({ role: l.role, [l.side === "debit" ? "debit_minor" : "credit_minor"]: toMinor(l.amount) })),
              })); }}>
                <div className="ri-inline">
                  <div className="field"><label htmlFor="mj-date">Date</label><input id="mj-date" type="date" value={mj.entry_date} onChange={(e) => setMj({ ...mj, entry_date: e.target.value })} /></div>
                  <div className="field"><label htmlFor="mj-cur">Currency</label><select id="mj-cur" value={mj.currency} onChange={(e) => setMj({ ...mj, currency: e.target.value })}>{["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div className="field"><label htmlFor="mj-desc">Description</label><input id="mj-desc" value={mj.description} onChange={(e) => setMj({ ...mj, description: e.target.value })} /></div>
                </div>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Role</th><th>Side</th><th className="ri-num">Amount</th><th /></tr></thead>
                  <tbody>{mj.lines.map((l, i) => (
                    <tr key={i}>
                      <td><select aria-label={`Line ${i + 1} role`} value={l.role} onChange={(e) => setMj({ ...mj, lines: mj.lines.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })}>{(meta.data?.ledgerRoles ?? []).map((r) => <option key={r} value={r}>{roleText(r)}</option>)}</select></td>
                      <td><select aria-label={`Line ${i + 1} side`} value={l.side} onChange={(e) => setMj({ ...mj, lines: mj.lines.map((x, j) => (j === i ? { ...x, side: e.target.value } : x)) })}><option value="debit">Debit</option><option value="credit">Credit</option></select></td>
                      <td><input aria-label={`Line ${i + 1} amount`} inputMode="decimal" value={l.amount} onChange={(e) => setMj({ ...mj, lines: mj.lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} /></td>
                      <td><button type="button" className="btn-secondary btn btn-sm" disabled={mj.lines.length < 3} onClick={() => setMj({ ...mj, lines: mj.lines.filter((_, j) => j !== i) })}>Remove</button></td></tr>))}</tbody></table></div>
                <div className="ri-inline">
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => setMj({ ...mj, lines: [...mj.lines, { role: "HOUSE_BANK", side: "debit", amount: "" }] })}>Add line</button>
                  <span className={mjDebit === mjCredit && mjDebit > 0 ? "" : "ri-note"}>Debits {mjDebit.toLocaleString()} · credits {mjCredit.toLocaleString()} {mjDebit === mjCredit && mjDebit > 0 ? "(balanced)" : "(must be equal)"}</span>
                  <button className="btn btn-sm" type="submit" disabled={!mj.entry_date || !mj.description || mjDebit !== mjCredit || mjDebit === 0}>Request</button>
                </div>
              </form>
            ) : <p>You can read journals but not request them.</p>}
          </div>
        )}
        {tab === "bank" && (
          <div className="card"><h2>Client-money bank balances</h2>
            <p className="ri-note">Enter the closing balance from the bank statement of the client-money account. Accounts compares it with the ledger and shows any difference.</p>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Statement date</th><th>Currency</th><th className="ri-num">Closing balance</th><th>Entered by</th><th>Note</th></tr></thead>
              <tbody>{!banks.data?.statements.length && <tr><td colSpan={5}>None entered.</td></tr>}{(banks.data?.statements ?? []).map((s) => <tr key={s.id}><td>{s.statement_date}</td><td>{s.currency}</td><td className="ri-num">{minorText(s.closing_balance_minor, s.currency)}</td><td>{s.entered_by}</td><td>{s.note || "—"}</td></tr>)}</tbody></table></div>
            {can("ri.accounts.post") && (
              <form onSubmit={(e) => { e.preventDefault(); run("Balance recorded.", () => api.post("/api/reinsurance/accounting/bank-statements", bank).then(() => setBank({ ...bank, closing_balance: "", note: "" }))); }}>
                <div className="ri-inline">
                  <div className="field"><label htmlFor="bk-cur">Currency</label><select id="bk-cur" value={bank.currency} onChange={(e) => setBank({ ...bank, currency: e.target.value })}>{["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div className="field"><label htmlFor="bk-date">Statement date</label><input id="bk-date" type="date" value={bank.statement_date} onChange={(e) => setBank({ ...bank, statement_date: e.target.value })} /></div>
                  <div className="field"><label htmlFor="bk-bal">Closing balance</label><input id="bk-bal" inputMode="decimal" value={bank.closing_balance} onChange={(e) => setBank({ ...bank, closing_balance: e.target.value })} /></div>
                  <button className="btn btn-sm" type="submit" disabled={!bank.statement_date || !bank.closing_balance}>Record</button>
                </div>
              </form>
            )}
            <p className="ri-note">Brokerage moves from client money to the house account by a transfer that a second person approves; request one from Accounts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
