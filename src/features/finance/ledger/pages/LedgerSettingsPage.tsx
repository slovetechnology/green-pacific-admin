import "@/shared/styles/ledger.css";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useGlAccess, usePostingAccounts, type Account } from "../api/ledger";
import { confirmDialog } from "@/shared/components/Dialogs";

interface Settings {
  settings: Record<string, string>;
  sources: { key: string; setting: string; label: string; help: string }[];
  accountMap: { key: string; code: string; group: string; label: string; help?: string; account: { id: number; code: string; name: string } | null; overridden: boolean; problem: string | null }[];
  expenseCategories: { category: string; account: { id: number; code: string; name: string } | null; overridden: boolean }[];
  roles: { code: string; name: string; description: string }[];
  canManageRoles: boolean;
  canEdit: boolean;
}

/** Go-live date, what posts automatically, which account each rule uses, exchange rates and accounting roles. */
export function LedgerSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["gl", "settings"], queryFn: () => api.get<Settings>("/api/gl/settings") });
  const accounts = usePostingAccounts();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fn: () => Promise<unknown>, done: string) {
    setFlash(null);
    try {
      await fn();
      setFlash({ ok: true, text: done });
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "That did not work." });
    }
  }

  if (isLoading || !data) return <p>Loading…</p>;
  const groups = [...new Set(data.accountMap.map((a) => a.group))];
  const list = accounts.data?.accounts ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Ledger Settings</h1>
        </div>
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}

      <GeneralSettings data={data} onSave={(body) => act(() => api.put("/api/gl/settings", body), "Settings saved.")} />

      <div className="card">
        <h2>Posting accounts</h2>
        <p className="ledger-note">
          Each automatic posting uses these accounts from the <Link to="/chart-of-accounts">chart of accounts</Link>. Changing one affects
          what posts from now on; what is already posted stays where it is.
          {data.canEdit && (
            <> If the chart is empty, <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(() => api.post("/api/gl/chart/seed"), "Standard chart of accounts loaded (existing accounts left as they were).")}>load the standard chart</button>.</>
          )}
        </p>
        {groups.map((g) => (
          <div key={g} className="table-wrap">
            <h3 className="ledger-group">{g}</h3>
            <table className="data-grid-table">
              <tbody>
                {data.accountMap.filter((a) => a.group === g).map((a) => (
                  <tr key={a.key}>
                    <td className="ledger-rule">
                      {a.label}
                      {a.help && <div className="ledger-memo">{a.help}</div>}
                      {a.problem && <div className="ledger-problem">{a.problem}</div>}
                    </td>
                    <td>
                      {data.canEdit ? (
                        <AccountPicker accounts={list} value={a.account?.id ?? null}
                          onChange={(id) => act(() => api.put(`/api/gl/account-map/${a.key}`, { account_id: id }), `${a.label} updated.`)} />
                      ) : a.account ? `${a.account.code} ${a.account.name}` : "—"}
                    </td>
                    <td>
                      {a.overridden ? (
                        data.canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(() => api.put(`/api/gl/account-map/${a.key}`, { account_id: null }), `${a.label} back to ${a.code}.`)}>Use default ({a.code})</button>
                      ) : <span className="ledger-memo">Default</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Expense categories</h2>
        <p className="ledger-note">Which expense account each category on the Expenses page posts to. A category not listed here uses "Expenses with no category account".</p>
        <div className="table-wrap">
          <table className="data-grid-table">
            <tbody>
              {data.expenseCategories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>
                    {data.canEdit ? (
                      <AccountPicker accounts={list.filter((a) => a.account_type === "Expense")} value={c.account?.id ?? null} placeholder="Default expense account"
                        onChange={(id) => act(() => api.put("/api/gl/expense-categories", { category: c.category, account_id: id }), `${c.category} updated.`)} />
                    ) : c.account ? `${c.account.code} ${c.account.name}` : "Default expense account"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CommissionDefaults canEdit={data.canEdit} />
      <FxRates onAdded={() => act(async () => undefined, "Rate added.")} />
      {data.canManageRoles && <Grants roles={data.roles} />}
    </div>
  );
}

function AccountPicker({ accounts, value, onChange, placeholder = "Choose…" }: { accounts: Account[]; value: number | null; onChange: (id: number | null) => void; placeholder?: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="Account">
      <option value="">{placeholder}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
    </select>
  );
}

function GeneralSettings({ data, onSave }: { data: Settings; onSave: (body: Record<string, string>) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>(data.settings);
  useEffect(() => setForm(data.settings), [data.settings]);
  return (
    <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); void onSave(form); }}>
      <h2>Go-live and automatic posting</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="gl-golive">Go-live date</label>
          <input id="gl-golive" type="date" value={form.go_live_date ?? ""} disabled={!data.canEdit} onChange={(e) => setForm({ ...form, go_live_date: e.target.value })} />
          <small className="ledger-memo">Records dated from this day post automatically; everything before it goes in as opening balances. Fixed once anything is posted.</small>
        </div>
      </div>
      <ul className="ledger-switches">
        {data.sources.map((s) => (
          <li key={s.key}>
            <label>
              <input type="checkbox" checked={form[s.setting] === "1"} disabled={!data.canEdit}
                onChange={(e) => setForm({ ...form, [s.setting]: e.target.checked ? "1" : "0" })} />
              <strong>{s.label}</strong>
            </label>
            <div className="ledger-memo">{s.help}</div>
          </li>
        ))}
      </ul>
      {data.canEdit && <button type="submit" className="btn">Save</button>}
    </form>
  );
}

function FxRates({ onAdded }: { onAdded: () => void }) {
  const access = useGlAccess();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["gl", "fx-rates"],
    queryFn: () => api.get<{ currencies: { code: string; name: string }[]; rates: { id: number; currency: string; rate_date: string; rate: number; entered_by: string | null }[] }>("/api/gl/fx-rates"),
  });
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/gl/fx-rates", { currency, rate_date: date, rate });
      setRate("");
      await queryClient.invalidateQueries({ queryKey: ["gl", "fx-rates"] });
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the rate.");
    }
  }

  return (
    <div className="card">
      <h2>Exchange rates (CBN official, naira per unit)</h2>
      <p className="ledger-note">One table for the whole firm (reinsurance uses it too). A journal in another currency uses the latest rate on or before its date. A rate can't be edited; enter the right one for a new date.</p>
      {access.can("gl.fx") && (
        <form onSubmit={add} className="toolbar">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
            {(data?.currencies ?? []).filter((c) => c.code !== "NGN").map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Rate date" />
          <input inputMode="decimal" placeholder="e.g. 1550.25" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Rate" />
          <button type="submit" className="btn btn-sm">Add rate</button>
        </form>
      )}
      {error && <div className="flash flash-error">{error}</div>}
      <div className="table-wrap">
        <table className="data-grid-table">
          <thead><tr><th>Date</th><th>Currency</th><th className="num">₦ per unit</th><th>Entered by</th></tr></thead>
          <tbody>
            {(data?.rates ?? []).length === 0 && <tr><td colSpan={4} className="ledger-note">No rates entered yet.</td></tr>}
            {(data?.rates ?? []).map((r) => (
              <tr key={r.id}><td>{r.rate_date}</td><td>{r.currency}</td><td className="num">{r.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td><td>{r.entered_by}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Grants({ roles }: { roles: Settings["roles"] }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["gl", "grants"],
    queryFn: () => api.get<{ grants: { userId: number; username: string; loginRole: string; roles: string[] }[]; users: { id: number; username: string; role: string }[] }>("/api/gl/grants"),
  });
  const [userId, setUserId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = data?.grants.find((g) => String(g.userId) === userId);
  useEffect(() => setPicked(current?.roles ?? []), [userId, current?.roles]);

  async function save(id: string, next: string[]) {
    setError(null);
    try {
      await api.put(`/api/gl/grants/${id}`, { roles: next });
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the roles.");
    }
  }
  const nameOf = (code: string) => roles.find((r) => r.code === code)?.name ?? code;

  return (
    <div className="card">
      <h2>Accounting roles</h2>
      <ul className="ledger-links">
        {roles.map((r) => <li key={r.code}><strong>{r.name}</strong>: {r.description}</li>)}
      </ul>
      <p className="ledger-note">Admins can do everything. A viewer login can only be an Auditor; agents can't hold accounting roles.</p>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="table-wrap">
        <table className="data-grid-table">
          <thead><tr><th>User</th><th>Login role</th><th>Accounting roles</th><th /></tr></thead>
          <tbody>
            {(data?.grants ?? []).length === 0 && <tr><td colSpan={4} className="ledger-note">Nobody yet.</td></tr>}
            {(data?.grants ?? []).map((g) => (
              <tr key={g.userId}>
                <td>{g.username}</td>
                <td>{g.loginRole}</td>
                <td>{g.roles.map(nameOf).join(", ")}</td>
                <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => save(String(g.userId), [])}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="User">
          <option value="">Give a user a role…</option>
          {(data?.users ?? []).map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
        </select>
        {userId && roles.map((r) => (
          <label key={r.code} className="ledger-check-label">
            <input type="checkbox" checked={picked.includes(r.code)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.code] : picked.filter((c) => c !== r.code))} />
            {r.name}
          </label>
        ))}
        {userId && <button type="button" className="btn btn-sm" onClick={() => save(userId, picked)}>Save roles</button>}
      </div>
    </div>
  );
}

interface CommissionDefault {
  id: number;
  class_of_business: string;
  rate_percent: number;
  is_active: number;
  notes: string | null;
  cap: { name: string; percent: number; code: string } | null;
  overCap: boolean;
}

/**
 * Default commission rate per class: pre-filled on the transaction form when a class is picked. Each must sit
 * within the NAICOM cap for its class (the Policy Compliance rules); the server refuses one above it.
 */
function CommissionDefaults({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["commission-rates"], queryFn: () => api.get<{ defaults: CommissionDefault[] }>("/api/commission-rates") });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ class_of_business: "", rate_percent: "", notes: "", is_active: true });
  const [error, setError] = useState<string | null>(null);

  function start(row: CommissionDefault | null) {
    setError(null);
    setEditing(row ? row.id : "new");
    setForm(row
      ? { class_of_business: row.class_of_business, rate_percent: String(row.rate_percent), notes: row.notes ?? "", is_active: Boolean(row.is_active) }
      : { class_of_business: "", rate_percent: "", notes: "", is_active: true });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing === "new") await api.post("/api/commission-rates", form);
      else await api.put(`/api/commission-rates/${editing}`, form);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["commission-rates"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  async function remove(id: number) {
    if (!(await confirmDialog("Remove this default?"))) return;
    try {
      await api.delete(`/api/commission-rates/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["commission-rates"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove.");
    }
  }

  return (
    <div className="card">
      <h2>Default commission rates</h2>
      <p className="ledger-note">
        Pre-filled on a new policy when its class is picked; staff can still change the rate on the policy. Each default must be
        within the NAICOM cap for its class (Policy Compliance rules). List several spellings of a class with "|"; a class name also
        covers its "— sub-type" variants, and the most specific match wins.
      </p>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="table-wrap">
        <table className="data-grid-table">
          <thead><tr><th>Classes</th><th className="num">Default</th><th className="num">NAICOM cap</th><th>Notes</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {(data?.defaults ?? []).map((d) => (
              <tr key={d.id} style={d.is_active ? undefined : { opacity: 0.55 }}>
                <td>{d.class_of_business.split("|").join(", ")}{!d.is_active && <span className="badge badge-cancelled ledger-tag">Off</span>}</td>
                <td className="num">{d.rate_percent}%</td>
                <td className="num">{d.cap ? `${d.cap.percent}%` : "—"}{d.overCap && <span className="badge badge-unpaid ledger-tag">Above cap</span>}</td>
                <td className="ledger-memo">{d.notes}</td>
                {canEdit && (
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => start(d)}>Edit</button>{" "}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(d.id)}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && editing === null && <div className="toolbar"><button type="button" className="btn btn-secondary btn-sm" onClick={() => start(null)}>+ Add a default</button></div>}
      {canEdit && editing !== null && (
        <form onSubmit={save} className="form-grid">
          <div className="field ledger-wide">
            <label htmlFor="cd-class">Classes of business (separate spellings with |)</label>
            <input id="cd-class" value={form.class_of_business} onChange={(e) => setForm({ ...form, class_of_business: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="cd-rate">Default rate (%)</label>
            <input id="cd-rate" inputMode="decimal" value={form.rate_percent} onChange={(e) => setForm({ ...form, rate_percent: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="cd-notes">Notes</label>
            <input id="cd-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="field">
            <label className="ledger-check-label">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> In use
            </label>
          </div>
          <div className="toolbar">
            <button type="submit" className="btn btn-sm">Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
