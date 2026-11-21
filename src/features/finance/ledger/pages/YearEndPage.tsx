import "@/shared/styles/ledger.css";
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, openApiFile } from "@/shared/api/client";
import { fmtMinor } from "../api/ledger";
import { confirmDialog } from "@/shared/components/Dialogs";

interface Year {
  year: number;
  status: "Open" | "Closed";
  problems: string[];
  close: { journal_id: number | null; profit_cents: number; closed_by: string; closed_at: string; packet_sha256: string } | null;
}

/**
 * Year-End Close: moves a year's income and expenses into retained earnings, freezes the year and files the
 * closing pack (FIRS and NAICOM figures). Finance Director only; reopening needs a reason and reverses the close.
 */
export function YearEndPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["gl", "year-end"], queryFn: () => api.get<{ years: Year[]; canClose: boolean }>("/api/gl/year-end") });
  const [busy, setBusy] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [reopening, setReopening] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  async function act(year: number, fn: () => Promise<string>) {
    setBusy(year);
    setFlash(null);
    try {
      setFlash({ ok: true, text: await fn() });
      setReopening(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  }

  const close = (year: number) => act(year, async () => {
    const r = await api.post<{ journalNo: string | null; profitCents: number }>(`/api/gl/year-end/${year}/close`);
    return `${year} closed${r.journalNo ? ` with ${r.journalNo}` : ""}: ${r.profitCents >= 0 ? "profit" : "loss"} of ${fmtMinor(Math.abs(r.profitCents))} moved to retained earnings.`;
  });
  const reopen = (year: number) => act(year, async () => {
    const r = await api.post<{ reversalNo: string | null }>(`/api/gl/year-end/${year}/reopen`, { reason });
    return `${year} reopened${r.reversalNo ? `; the close was reversed by ${r.reversalNo}` : ""}.`;
  });
  const download = (year: number, format: "txt" | "json") =>
    openApiFile(`/api/gl/year-end/${year}/packet${format === "txt" ? "?format=txt" : ""}`).catch((err) =>
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "Download failed." }));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Year-End Close</h1>
          <p className="ledger-intro">
            Closing a year posts one journal on 31 December that moves its income and expenses into retained earnings, then
            nothing more can post into that year. A closing pack is filed with the figures for the company income tax
            computation and the NAICOM annual returns. Close every month in <Link to="/accounting-periods">Accounting Periods</Link> first.
          </p>
        </div>
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}
      {isLoading && <p>Loading…</p>}
      {data && data.years.length === 0 && <div className="card"><p>Set the ledger's go-live date on <Link to="/ledger/settings">Ledger Settings</Link> first.</p></div>}
      {data?.years.map((y) => (
        <div key={y.year} className="card">
          <div className="ledger-year-head">
            <h2>{y.year}</h2>
            <span className={`badge ${y.status === "Closed" ? "badge-paid" : "badge-secondary"}`}>{y.status}</span>
          </div>
          {y.close ? (
            <>
              <p>
                Closed by {y.close.closed_by} on {String(y.close.closed_at).slice(0, 10)}.{" "}
                {y.close.profit_cents >= 0 ? "Profit" : "Loss"} of {fmtMinor(Math.abs(y.close.profit_cents))} moved to retained earnings.
                {y.close.journal_id && <> <Link to={`/ledger/journals/${y.close.journal_id}`}>Closing journal</Link>.</>}
              </p>
              <div className="toolbar">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(y.year, "txt")}>Closing pack (text)</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(y.year, "json")}>Closing pack (JSON)</button>
                <Link className="btn btn-secondary btn-sm" to={`/ledger/profit-and-loss?from=${y.year}-01-01&to=${y.year}-12-31`}>Profit or Loss</Link>
                {data.canClose && reopening !== y.year && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReopening(y.year)}>Reopen…</button>
                )}
              </div>
              {reopening === y.year && (
                <div className="form-grid">
                  <div className="field ledger-wide">
                    <label htmlFor={`reopen-${y.year}`}>Why is {y.year} being reopened? (e.g. an audit adjustment)</label>
                    <input id={`reopen-${y.year}`} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <div className="toolbar">
                    <button type="button" className="btn" disabled={!reason.trim() || busy === y.year} onClick={() => reopen(y.year)}>Reverse the close and reopen</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setReopening(null)}>Cancel</button>
                  </div>
                </div>
              )}
              <p className="ledger-memo">Pack fingerprint (SHA-256): {y.close.packet_sha256}</p>
            </>
          ) : y.problems.length ? (
            <>
              <p className="ledger-note">Not ready to close:</p>
              <ul>{y.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </>
          ) : (
            <>
              <p>Ready to close. The ledger is brought up to date first; the year is then frozen.</p>
              {data.canClose
                ? <button type="button" className="btn" disabled={busy === y.year}
                    onClick={async () => { if (await confirmDialog(`Close ${y.year}? Nothing more can post into it unless it is reopened.`)) void close(y.year); }}>
                    {busy === y.year ? "Closing…" : `Close ${y.year}`}
                  </button>
                : <p className="ledger-memo">A Finance Director closes the year.</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
