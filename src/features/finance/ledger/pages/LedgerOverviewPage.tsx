import "@/shared/styles/ledger.css";
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { SOURCE_LABEL, useGlAccess } from "../api/ledger";
import { Kpi } from "./ProfitLossPage";

interface Overview {
  settings: { go_live_date: string };
  counts: { posted: number; drafts: number; rejected: number; postingErrors: number };
  lastSync: { at: string; posted: number; restated: number; reversed: number; errors: number } | null;
  chartEmpty: boolean;
  accountProblems: { key: string; label: string; message: string }[];
  postingErrors: { source_type: string; source_id: number; source_date: string | null; message: string; last_seen: string }[];
}

const SOURCE_PAGES: Record<string, (id: number) => string> = {
  receipt: (id) => `/receipts/${id}`,
  remittance: (id) => `/insurer-remittances/${id}/edit`,
  commission_statement: (id) => `/commission-statements/${id}`,
  expense: (id) => `/expenses/${id}/edit`,
};

/** The ledger's front page: set-up checklist, what is waiting for approval, and records that could not post. */
export function LedgerOverviewPage() {
  const access = useGlAccess();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["gl", "overview"], queryFn: () => api.get<Overview>("/api/gl/overview") });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.post<{ posted: number; restated: number; reversed: number; errors: number; enabled: boolean }>("/api/gl/sync");
      setMessage(r.enabled ? `${r.posted} posted, ${r.restated} re-stated, ${r.reversed} reversed, ${r.errors} could not post.` : "Set a go-live date first.");
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not bring the ledger up to date.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the ledger."}</div>;
  const goLive = data.settings.go_live_date;
  const steps = [
    { done: !data.chartEmpty, text: "Load the standard chart of accounts", to: "/ledger/settings" },
    { done: data.accountProblems.length === 0, text: "Every posting rule points at an account", to: "/ledger/settings" },
    { done: Boolean(goLive), text: goLive ? `Go-live date set: ${goLive}` : "Pick the go-live date", to: "/ledger/settings" },
    { done: data.counts.posted > 0, text: "Enter and approve the opening balances", to: "/ledger/journals/new?kind=opening" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials & Accounting</p>
          <h1>General Ledger</h1>
          <p className="ledger-intro">
            Double-entry books kept from the records you already enter. Receipts, insurer remittances, reconciled commission statements,
            producer payments, expenses and investment income post themselves every ten minutes; manual journals and opening balances
            are drafted by an accountant and approved by the Finance Director.
          </p>
        </div>
        {access.can("gl.sync") && (
          <div className="page-header-actions">
            <button type="button" className="btn" onClick={syncNow} disabled={busy}>{busy ? "Posting…" : "Bring up to date"}</button>
          </div>
        )}
      </div>
      {message && <div className="flash flash-success">{message}</div>}

      {steps.some((s) => !s.done) && (
        <div className="card">
          <h2>Getting started</h2>
          <ol className="ledger-steps">
            {steps.map((s) => (
              <li key={s.text} className={s.done ? "done" : ""}>
                <span aria-hidden>{s.done ? "✓" : "○"}</span> {s.done ? s.text : <Link to={s.to}>{s.text}</Link>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="kpi-row">
        <Kpi label="Posted journals" value={data.counts.posted.toLocaleString()} />
        <Kpi label="Awaiting approval" value={data.counts.drafts.toLocaleString()} />
        <Kpi label="Records that could not post" value={data.counts.postingErrors.toLocaleString()} tone={data.counts.postingErrors ? "bad" : undefined} />
      </div>
      {data.lastSync && (
        <p className="ledger-note">
          Last brought up to date {new Date(data.lastSync.at).toLocaleString()}: {data.lastSync.posted} posted, {data.lastSync.restated} re-stated, {data.lastSync.reversed} reversed.
        </p>
      )}
      {data.counts.drafts > 0 && (
        <div className="card">
          <p>{data.counts.drafts} journal{data.counts.drafts === 1 ? " is" : "s are"} waiting for approval. <Link to="/ledger/journals?status=Draft">Review them</Link>.</p>
        </div>
      )}

      {data.accountProblems.length > 0 && (
        <div className="card">
          <h2>Posting rules that need an account</h2>
          <ul>{data.accountProblems.map((p) => <li key={p.key}><strong>{p.label}:</strong> {p.message}</li>)}</ul>
        </div>
      )}

      {data.postingErrors.length > 0 && (
        <div className="card">
          <h2>Records that could not post</h2>
          <p className="ledger-note">Each is retried every ten minutes. The usual causes are a closed month (reopen it in Accounting Periods) or a posting rule without an account.</p>
          <div className="table-wrap">
            <table className="data-grid-table">
              <thead><tr><th>Record</th><th>Date</th><th>Why</th></tr></thead>
              <tbody>
                {data.postingErrors.map((e) => {
                  const label = `${SOURCE_LABEL[e.source_type] ?? e.source_type} #${e.source_id}`;
                  const to = SOURCE_PAGES[e.source_type]?.(e.source_id);
                  return (
                    <tr key={`${e.source_type}-${e.source_id}`}>
                      <td>{to ? <Link to={to}>{label}</Link> : label}</td>
                      <td>{e.source_date ?? ""}</td>
                      <td>{e.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Statements</h2>
        <ul className="ledger-links">
          <li><Link to="/ledger/trial-balance">Trial Balance</Link>: every account's opening balance, movements and closing balance.</li>
          <li><Link to="/ledger/profit-and-loss">Profit or Loss</Link>: commission earned and other income against expenses.</li>
          <li><Link to="/ledger/balance-sheet">Balance Sheet</Link>: with client money (trust) separated from the broker's own, and the trust position.</li>
        </ul>
      </div>
    </div>
  );
}
