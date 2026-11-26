import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";

// Quote revisions and frozen comparison sheets (backend sales/quotes/quoteRevisions.js and comparisonSheets.js).

interface Revision {
  id: number;
  revision: number;
  change_reason: string | null;
  changed_by: string | null;
  created_at: string;
  changes: { field: string; label: string; from: string | null; to: string | null }[];
}

interface RevisionsResponse {
  quoteId: number;
  revision: number;
  revisions: Revision[];
  sheets: { version: number; revision: number }[];
}

/** One quote's revisions, newest first, each with what changed from the one before. */
export function QuoteRevisions({ dealId, quoteId }: { dealId: number; quoteId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["deals", String(dealId), "quotes", quoteId, "revisions"],
    queryFn: () => api.get<RevisionsResponse>(`/api/deals/${dealId}/quotes/${quoteId}/revisions`),
  });
  if (isLoading) return <p className="pl-hint">Loading the history…</p>;
  if (error || !data) return <p className="pl-hint">The history could not be loaded.</p>;
  const onSheets = (rev: number) => data.sheets.filter((s) => s.revision === rev).map((s) => `v${s.version}`);
  return (
    <ol className="pl-hint" style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }} reversed>
      {[...data.revisions].reverse().map((r) => (
        <li key={r.id} style={{ marginBottom: "0.35rem" }}>
          <b>Revision {r.revision}</b> · {String(r.created_at).slice(0, 16)}{r.changed_by ? ` · ${r.changed_by}` : ""}
          {r.change_reason ? `: ${r.change_reason}` : ""}
          {onSheets(r.revision).length > 0 && <> · shown on comparison {onSheets(r.revision).join(", ")}</>}
          {r.changes.length > 0 && (
            <ul style={{ margin: "0.15rem 0 0", paddingLeft: "1rem" }}>
              {r.changes.map((c) => <li key={c.field}>{c.label}: {c.from ?? "—"} → {c.to ?? "—"}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

interface SheetSummary {
  id: number;
  version: number;
  quoteCount: number;
  recommendedQuoteId: number | null;
  selectedQuoteId: number | null;
  note: string | null;
  preparedBy: string | null;
  createdAt: string;
  sha256: string;
}

/** The deal's frozen comparison sheets: freeze the current comparison as a new version, and open each as a PDF. */
export function ComparisonSheets({ dealId, canFreeze, quoteCount }: { dealId: number; canFreeze: boolean; quoteCount: number }) {
  const queryClient = useQueryClient();
  const key = ["deals", String(dealId), "comparison-sheets"];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<{ sheets: SheetSummary[]; changedSinceLatest: boolean | null }>(`/api/deals/${dealId}/comparison-sheets`) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function freeze() {
    setBusy(true);
    setMessage(null);
    try {
      const out = await api.post<{ sheet: SheetSummary }>(`/api/deals/${dealId}/comparison-sheets`, { note });
      setNote("");
      setMessage({ tone: "ok", text: `Comparison version ${out.sheet.version} frozen. Open its PDF to share it.` });
      await queryClient.invalidateQueries({ queryKey: ["deals", String(dealId)] });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The comparison could not be frozen." });
    } finally {
      setBusy(false);
    }
  }

  const sheets = data?.sheets ?? [];
  return (
    <Panel eyebrow="For the client" title="Comparison sheets">
      <p className="pl-hint">
        Freeze the comparison before showing it to the client. Each version keeps the quotes exactly as they stood, so it can be reproduced later however the quotes change.
      </p>
      {data?.changedSinceLatest && <div className="pl-notice" role="status">The quotes have changed since version {sheets[0]?.version}. Freeze a new version before sharing it again.</div>}
      {message && <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}
      {isLoading ? <p className="pl-hint">Loading…</p> : sheets.length === 0 ? (
        <p className="pl-hint" style={{ margin: 0 }}>None frozen yet.</p>
      ) : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Version</th><th>Frozen</th><th>Quotes</th><th>Note</th><th><span className="sr-only">PDF</span></th></tr></thead>
            <tbody>
              {sheets.map((s) => (
                <tr key={s.id}>
                  <td>v{s.version}</td>
                  <td>{String(s.createdAt).slice(0, 16)}<div className="pl-hint">{s.preparedBy}</div></td>
                  <td>{s.quoteCount}</td>
                  <td className="wrap">{s.note ?? "—"}</td>
                  <td><a className="btn-secondary btn btn-sm" href={apiUrl(`/api/deals/${dealId}/comparison-sheets/${s.version}/pdf`)} target="_blank" rel="noreferrer">PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canFreeze && quoteCount > 0 && (data?.changedSinceLatest !== false) && (
        <div className="pl-inline-form" style={{ marginTop: "0.8rem" }}>
          <div className="field is-wide"><label htmlFor="qcs-note">Note on this version (optional)</label><input id="qcs-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: for the renewal meeting on 3 December" /></div>
          <div className="field"><button type="button" className="btn btn-sm" onClick={freeze} disabled={busy}>{busy ? "Freezing…" : sheets.length ? `Freeze version ${sheets[0].version + 1}` : "Freeze the comparison"}</button></div>
        </div>
      )}
    </Panel>
  );
}
