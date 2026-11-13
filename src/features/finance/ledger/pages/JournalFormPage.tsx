import "@/shared/styles/ledger.css";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinor, usePostingAccounts, type Account, type JournalDetail } from "../api/ledger";

interface LineDraft {
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
}
const blank = (): LineDraft => ({ account_id: "", debit: "", credit: "", memo: "" });
const TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"];

/** "1,250.50" -> 125050; anything unreadable counts as 0 here (the server rejects it with a message). */
function toMinor(text: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0")) : 0;
}

/**
 * New or edited manual journal, or the opening balances (?kind=opening). Saved as a draft; a Finance Director
 * (someone other than the drafter) approves it before it touches the ledger.
 */
export function JournalFormPage() {
  const { journalId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editing = Boolean(journalId);
  const accounts = usePostingAccounts();
  const overview = useQuery({ queryKey: ["gl", "overview"], queryFn: () => api.get<{ settings: { go_live_date: string } }>("/api/gl/overview") });
  const fx = useQuery({ queryKey: ["gl", "fx-rates"], queryFn: () => api.get<{ currencies: { code: string }[] }>("/api/gl/fx-rates") });
  const existing = useQuery({
    queryKey: ["gl", "journal", journalId],
    queryFn: () => api.get<{ journal: JournalDetail }>(`/api/gl/journals/${journalId}`),
    enabled: editing,
  });

  const [kind, setKind] = useState(params.get("kind") === "opening" ? "opening" : "manual");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(kind === "opening" ? "Opening balances at go-live" : "");
  const [currency, setCurrency] = useState("NGN");
  const [lines, setLines] = useState<LineDraft[]>([blank(), blank()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const goLive = overview.data?.settings.go_live_date;
  useEffect(() => {
    if (kind === "opening" && goLive && !editing) setDate(goLive);
  }, [kind, goLive, editing]);

  useEffect(() => {
    const j = existing.data?.journal;
    if (!j) return;
    setKind(j.kind);
    setDate(j.journal_date);
    setDescription(j.description);
    setCurrency(j.currency);
    const foreign = j.currency !== "NGN";
    setLines(j.lines.map((l) => {
      const d = foreign ? l.foreignDebitMinor : l.debitCents;
      const c = foreign ? l.foreignCreditMinor : l.creditCents;
      return { account_id: String(l.accountId), debit: d ? (d / 100).toFixed(2) : "", credit: c ? (c / 100).toFixed(2) : "", memo: l.memo ?? "" };
    }));
  }, [existing.data]);

  const grouped = useMemo(() => {
    const out = new Map<string, Account[]>();
    for (const t of TYPES) out.set(t, []);
    for (const a of accounts.data?.accounts ?? []) out.get(a.account_type)?.push(a);
    return out;
  }, [accounts.data]);

  const debits = lines.reduce((s, l) => s + toMinor(l.debit), 0);
  const credits = lines.reduce((s, l) => s + toMinor(l.credit), 0);
  const difference = debits - credits;

  const update = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = { kind, journal_date: date, description, currency, lines: lines.filter((l) => l.account_id || l.debit || l.credit) };
    try {
      let id = Number(journalId);
      if (editing) await api.put(`/api/gl/journals/${journalId}`, body);
      else id = (await api.post<{ id: number }>("/api/gl/journals", body)).id;
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
      navigate(`/ledger/journals/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the journal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/ledger/journals">Journals</Link></p>
          <h1>{editing ? "Edit draft journal" : kind === "opening" ? "Opening balances" : "New journal"}</h1>
          <p className="ledger-intro">
            {kind === "opening"
              ? `Balances brought forward from the old books on the go-live date${goLive ? ` (${goLive})` : ""}: bank and trust accounts, receivables, premium owed to insurers, other payables and equity. Only one set can be live.`
              : "Saved as a draft. Someone with the Finance Director role, other than you, approves it before it is posted."}
          </p>
        </div>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      <form onSubmit={submit}>
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="jf-date">Date</label>
              <input id="jf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={kind === "opening"} required />
            </div>
            <div className="field">
              <label htmlFor="jf-currency">Currency</label>
              <select id="jf-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {(fx.data?.currencies ?? [{ code: "NGN" }]).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div className="field ledger-wide">
              <label htmlFor="jf-desc">Description</label>
              <input id="jf-desc" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
          </div>
          {currency !== "NGN" && <p className="ledger-note">Amounts are in {currency}. Each line is converted to naira at the CBN rate in force on the journal date (set rates on Ledger Settings).</p>}
        </div>
        <div className="card">
          <div className="table-wrap">
            <table className="data-grid-table ledger-lines">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th>Memo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select value={l.account_id} onChange={(e) => update(i, { account_id: e.target.value })} aria-label={`Line ${i + 1} account`}>
                        <option value="">Choose an account…</option>
                        {[...grouped.entries()].map(([type, list]) => (
                          <optgroup key={type} label={type}>
                            {list.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}{a.classification === "Fiduciary" ? " (client money)" : ""}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td><input inputMode="decimal" className="num" value={l.debit} onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} aria-label={`Line ${i + 1} debit`} /></td>
                    <td><input inputMode="decimal" className="num" value={l.credit} onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} aria-label={`Line ${i + 1} credit`} /></td>
                    <td><input value={l.memo} onChange={(e) => update(i, { memo: e.target.value })} aria-label={`Line ${i + 1} memo`} /></td>
                    <td>
                      {lines.length > 2 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ledger-grand-total">
                  <th>Total</th>
                  <th className="num">{fmtMinor(debits, currency)}</th>
                  <th className="num">{fmtMinor(credits, currency)}</th>
                  <th colSpan={2}>
                    {difference === 0
                      ? debits > 0 && <span className="badge badge-paid">Balanced</span>
                      : <span className="badge badge-unpaid">Out by {fmtMinor(Math.abs(difference), currency)}</span>}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="toolbar">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button>
          </div>
        </div>
        <div className="toolbar">
          <button type="submit" className="btn" disabled={saving || difference !== 0 || debits === 0}>{saving ? "Saving…" : "Save draft for approval"}</button>
          <Link to={editing ? `/ledger/journals/${journalId}` : "/ledger/journals"} className="btn btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
