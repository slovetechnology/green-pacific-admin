import "@/shared/styles/ledger.css";
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinor } from "../api/ledger";
import { confirmDialog } from "@/shared/components/Dialogs";

interface Position { asAt: string; trustBank: number; held: number; owed: number; surplus: number; available: number }
interface TransferJournal { id: number; journal_no: string | null; journal_date: string; status: string; total_cents: number; created_by: string; approved_by: string | null; reason: string | null; reversed_by_id: number | null; live: boolean }
interface Month { year: number; month: number; key: number; label: string; to: string; position: Position; commissionEarned: number; transferred: number; transfers: TransferJournal[]; coveredByLater: boolean }
interface Pending {
  id: number; journal_date: string; description: string; total_cents: number; created_by: string;
  lines: { lineNo: number; accountCode: string; accountName: string; debitCents: number; creditCents: number; memo: string | null }[];
  check: { available: number; ok: boolean } | null;
}
interface Overview {
  auto: boolean; goLive: string; today: string; position: Position | null; pending: Pending | null; months: Month[];
  can: { draft: boolean; approve: boolean; settings: boolean }; me: string;
}

/**
 * Commission Transfer: moves the broker's own money (brokerage and charges collected with premium) from the
 * client premium trust account to the operating account, once a month. The amount can never exceed what the
 * trust account holds beyond the premium owed to insurers; a Finance Director approves, and the check is
 * repeated at approval.
 */
export function CommissionTransferPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["gl", "commission-transfer"], queryFn: () => api.get<Overview>("/api/gl/commission-transfer") });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ key: "", date: "", amount: "" });

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setFlash(null);
    try {
      setFlash({ ok: true, text: await fn() });
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "That did not work." });
    } finally {
      setBusy(false);
    }
  }

  // A month before the latest transfer is covered by it (the surplus is cumulative), so only later months are offered.
  const open = data?.months.filter((m) => !m.coveredByLater && !m.transfers.some((t) => t.live)) ?? [];
  const chosen = open.find((m) => String(m.key) === form.key) ?? open[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Commission Transfer</h1>
          <p className="ledger-intro">
            Premium is banked whole in the client premium trust account, so the brokerage earned on it stays there until it is moved.
            Each month the brokerage and charges are transferred to the operating account, which pays the firm's expenses. Only the
            trust surplus can move: what the account holds beyond the premium owed to insurers.
          </p>
        </div>
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}
      {isLoading && <p>Loading…</p>}
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the transfer."}</div>}
      {data && !data.goLive && <div className="card"><p>Set the ledger's go-live date on <Link to="/ledger/settings">Ledger Settings</Link> first.</p></div>}

      {data?.position && (
        <div className="kpi-row">
          <div className="card kpi-card"><span className="kpi-label">Trust bank balance today</span><strong className="kpi-value">{fmtMinor(data.position.trustBank)}</strong></div>
          <div className="card kpi-card"><span className="kpi-label">Premium owed to insurers</span><strong className="kpi-value">{fmtMinor(data.position.owed)}</strong></div>
          <div className="card kpi-card">
            <span className="kpi-label">Surplus that can move today</span>
            <strong className={`kpi-value ${data.position.surplus < 0 ? "ledger-bad" : ""}`}>{fmtMinor(data.position.available)}</strong>
            {data.position.surplus < 0 && <span className="ledger-problem">Shortfall of {fmtMinor(-data.position.surplus)}: the trust account holds less than it owes.</span>}
          </div>
        </div>
      )}

      {data?.pending && (
        <div className="card ledger-pack-status">
          <div>
            <h2>Waiting for approval</h2>
            <p>{data.pending.description}</p>
            <p>
              <strong>{fmtMinor(data.pending.total_cents)}</strong> dated {data.pending.journal_date}, drafted by{" "}
              {data.pending.created_by.startsWith("system:") ? "the ledger (automatic)" : data.pending.created_by}.{" "}
              <Link to={`/ledger/journals/${data.pending.id}`}>Journal</Link>
            </p>
            <ul className="ledger-links">
              {data.pending.lines.map((l) => (
                <li key={l.lineNo}>{l.debitCents ? "Dr" : "Cr"} {l.accountCode} {l.accountName} {fmtMinor(l.debitCents || l.creditCents)}</li>
              ))}
            </ul>
            {data.pending.check && !data.pending.check.ok && (
              <p className="ledger-problem">
                The trust account can now spare only {fmtMinor(data.pending.check.available)}. Discard this draft and draft it again.
              </p>
            )}
          </div>
          <div className="toolbar">
            {data.can.approve && data.pending.created_by !== data.me && (
              <button type="button" className="btn" disabled={busy || data.pending.check?.ok === false}
                onClick={() => act(async () => `Posted ${(await api.post<{ journalNo: string }>(`/api/gl/commission-transfer/${data.pending!.id}/approve`)).journalNo}.`)}>
                Approve and post
              </button>
            )}
            {data.can.approve && data.pending.created_by === data.me && <span className="ledger-memo">Another Finance Director approves a transfer you drafted.</span>}
            {!data.can.approve && <span className="ledger-memo">A Finance Director approves the transfer.</span>}
            {data.can.draft && (
              <button type="button" className="btn btn-secondary" disabled={busy}
                onClick={async () => { if (await confirmDialog("Discard this draft transfer?")) void act(async () => { await api.delete(`/api/gl/commission-transfer/${data.pending!.id}`); return "Draft discarded."; }); }}>
                Discard
              </button>
            )}
          </div>
        </div>
      )}

      {data && data.goLive && !data.pending && data.can.draft && (
        <div className="card">
          <h2>Draft a transfer</h2>
          {open.length === 0 ? <p className="ledger-note">Every ended month's commission has been transferred. The next month can be drafted once it ends.</p> : (
            <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ct-month">Month</label>
                  <select id="ct-month" value={chosen ? String(chosen.key) : ""} onChange={(e) => setForm({ ...form, key: e.target.value, date: "" })}>
                    {open.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ct-date">Date</label>
                  <input id="ct-date" type="date" value={form.date || chosen?.to || ""} min={chosen?.to} max={data.today} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="ct-amount">Amount (blank = all that can move)</label>
                  <input id="ct-amount" inputMode="decimal" placeholder={chosen ? (Math.min(chosen.position.available, data.position?.available ?? 0) / 100).toFixed(2) : ""} value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <p className="ledger-note">
                Dated on the month end unless that month is already closed (then date it today). At most the lower of the surplus on that date
                and today's surplus can move.
              </p>
              <button type="button" className="btn" disabled={busy || !chosen}
                onClick={() => act(async () => {
                  await api.post("/api/gl/commission-transfer", { year: chosen!.year, month: chosen!.month, date: form.date || undefined, amount: form.amount || undefined });
                  setForm({ key: "", date: "", amount: "" });
                  return `Transfer for ${chosen!.label} drafted for a Finance Director to approve.`;
                })}>
                Draft transfer
              </button>
            </>
          )}
        </div>
      )}

      {data && data.goLive && (
        <div className="card">
          <h2>By month</h2>
          {data.can.settings ? (
            <label className="ledger-check-label">
              <input type="checkbox" checked={data.auto} disabled={busy}
                onChange={(e) => act(async () => { await api.put("/api/gl/settings", { commission_transfer_auto: e.target.checked ? "1" : "0" }); return e.target.checked ? "The transfer will be drafted automatically after each month ends." : "Automatic drafting is off."; })} />
              Draft the transfer automatically after each month ends
            </label>
          ) : <p className="ledger-memo">Automatic drafting is {data.auto ? "on" : "off"}.</p>}
          {data.months.length === 0 ? <p className="ledger-note">No month has ended since go-live.</p> : (
            <div className="table-wrap">
              <table className="data-grid-table ledger-statement">
                <thead>
                  <tr><th>Month</th><th className="num">Commission earned</th><th className="num">Surplus at month end</th><th className="num">Transferred</th><th>Journals</th></tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td className="num">{fmtMinor(m.commissionEarned)}</td>
                      <td className={`num ${m.position.surplus < 0 ? "ledger-bad" : ""}`}>{fmtMinor(m.position.surplus)}</td>
                      <td className="num">{m.transferred ? fmtMinor(m.transferred) : "—"}</td>
                      <td>
                        {m.transfers.length === 0 ? <span className="ledger-memo">{m.coveredByLater ? "Covered by a later transfer" : "None"}</span> : m.transfers.map((t) => (
                          <div key={t.id}>
                            <Link to={`/ledger/journals/${t.id}`}>{t.journal_no ?? "Journal"}</Link>{" "}
                            <span className="ledger-memo">{t.reversed_by_id ? "Reversed" : t.status}{t.status === "Rejected" && t.reason ? `: ${t.reason}` : ""}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="ledger-note">The surplus is cumulative: a month left untransferred is picked up by the next month's transfer.</p>
        </div>
      )}
    </div>
  );
}
