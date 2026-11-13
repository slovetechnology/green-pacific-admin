import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { downloadReport, useGlAccess } from "../api/ledger";

// The filter bar every statement shares: a date range (or a single "as at" date), the presentation currency,
// "Bring up to date" (posts anything recorded since the last automatic run) and the two downloads.
export interface ReportFilters {
  from: string;
  to: string;
  currency: string;
}

interface Props {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  asAt?: boolean;
  /** False on the account ledger, which is kept in naira only. */
  showCurrency?: boolean;
  exportPath: string;
  exportParams: Record<string, string>;
}

export function ReportToolbar({ filters, onChange, asAt = false, showCurrency = true, exportPath, exportParams }: Props) {
  const access = useGlAccess();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currencies = useQuery({
    queryKey: ["gl", "fx-rates"],
    queryFn: () => api.get<{ currencies: { code: string; name: string }[] }>("/api/gl/fx-rates"),
    staleTime: 5 * 60_000,
    enabled: showCurrency,
  });

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.post<{ posted: number; restated: number; reversed: number; errors: number; enabled: boolean }>("/api/gl/sync");
      setMessage(!r.enabled
        ? "Set a go-live date on Ledger Settings first."
        : `Up to date: ${r.posted} posted, ${r.restated} re-stated, ${r.reversed} reversed${r.errors ? `, ${r.errors} could not post (see Overview)` : ""}.`);
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not bring the ledger up to date.");
    } finally {
      setBusy(false);
    }
  }

  async function download(format: "xlsx" | "csv") {
    setMessage(null);
    try {
      await downloadReport(exportPath, exportParams, format);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Download failed.");
    }
  }

  return (
    <div className="card ledger-toolbar">
      <div className="toolbar">
        {!asAt && (
          <label className="ledger-field">
            <span>From</span>
            <input type="date" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
          </label>
        )}
        <label className="ledger-field">
          <span>{asAt ? "As at" : "To"}</span>
          <input type="date" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
        </label>
        {showCurrency && <label className="ledger-field">
          <span>Show in</span>
          <select value={filters.currency} onChange={(e) => onChange({ ...filters, currency: e.target.value })}>
            {(currencies.data?.currencies ?? [{ code: "NGN", name: "Nigerian Naira" }]).map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </label>}
        <div className="ledger-toolbar-actions">
          {access.can("gl.sync") && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={syncNow} disabled={busy}>
              {busy ? "Posting…" : "Bring up to date"}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download("xlsx")}>Excel</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download("csv")}>CSV</button>
        </div>
      </div>
      {message && <p className="ledger-note">{message}</p>}
    </div>
  );
}

/** "Shown in USD at 1,550.33 (CBN rate of 2026-05-30)" under a statement shown in another currency. */
export function CurrencyNote({ currency, rate, rateDate }: { currency: string; rate: number; rateDate: string | null }) {
  if (currency === "NGN") return null;
  return (
    <p className="ledger-note">
      Shown in {currency}, translated from naira at ₦{rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} per {currency} (CBN rate of {rateDate}).
      The books are kept in naira; this is for presentation only.
    </p>
  );
}
