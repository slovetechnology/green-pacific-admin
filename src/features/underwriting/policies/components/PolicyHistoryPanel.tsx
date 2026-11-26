import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";

// The policy this transaction belongs to across renewals (policy and term records, backend policyTerms.js): every
// term in order, and which policy this term renews, which staff can change.

interface Term { transaction_id: number; term_no: number; renews_transaction_id: number | null; link_status: string; policy_no: string | null; start_date: string | null; end_date: string | null; status: string; premium_due: number; business_type: string | null; insurer_name: string | null }
interface History {
  policy_id: number | null;
  term: { transaction_id: number; term_no: number; renews_transaction_id: number | null; link_status: string; link_note: string | null; linked_by: string | null } | null;
  terms: Term[];
}
interface Candidate { id: number; policy_no: string | null; class_of_business: string | null; insurer_name: string | null; start_date: string | null; end_date: string | null; fits: boolean }

const LINK_STATUS_TEXT: Record<string, string> = {
  New: "Renews no policy on file",
  Linked: "Link recorded by staff",
  Auto: "Linked from policy number and dates",
  Check: "Link needs checking",
};

export function PolicyHistoryPanel({ txId, clientId, classOfBusiness }: { txId: number; clientId: number; classOfBusiness: string | null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["transactions", txId, "policy-history"], queryFn: () => api.get<History>(`/api/transactions/${txId}/policy-history`) });
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const term = query.data?.term;
  const termTx = term?.transaction_id ?? txId;
  // The term's own policy number and start date (on an endorsement note, its policy's).
  const termRow = query.data?.terms.find((x) => x.transaction_id === termTx);
  const policyNo = termRow?.policy_no ?? null;
  const startDate = termRow?.start_date ?? null;
  const params = new URLSearchParams({ client_id: String(clientId), policy_no: policyNo || "", class_of_business: classOfBusiness || "", start_date: startDate || "", exclude_id: String(termTx) });
  const candidatesQuery = useQuery({
    queryKey: ["transactions", "renewal-candidates", params.toString()],
    enabled: editing,
    queryFn: () => api.get<{ candidates: Candidate[] }>(`/api/transactions/meta/renewal-candidates?${params}`),
  });
  const save = useMutation({
    mutationFn: () => api.put(`/api/transactions/${termTx}/renewal-link`, { renews_transaction_id: choice === "none" ? null : Number(choice), note }),
    onSuccess: () => { setEditing(false); void queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
  });

  if (query.isLoading) return <div className="card"><p>Loading…</p></div>;
  const history = query.data;
  if (!history || !term) return <div className="card"><h2>Policy history</h2><p className="text-muted">This policy's history has not been worked out yet; it is filled in within the hour.</p></div>;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ marginBottom: "0.25rem" }}>Policy history</h2>
          <p className="text-muted" style={{ margin: 0 }}>
            Term {term.term_no} of {history.terms.length}. {LINK_STATUS_TEXT[term.link_status] || term.link_status}
            {term.linked_by && term.link_status === "Linked" ? ` (${term.linked_by})` : ""}.{term.link_note ? ` ${term.link_note}` : ""}
          </p>
        </div>
        {user?.canWrite && !editing && (
          <button type="button" className="btn btn-sm" onClick={() => { setChoice(term.renews_transaction_id ? String(term.renews_transaction_id) : "none"); setNote(""); save.reset(); setEditing(true); }}>
            {term.link_status === "Check" ? "Check the renewal link" : "Change what this renews"}
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: "0.75rem" }}>
          {save.isError && <div className="flash flash-error">{(save.error as Error).message}</div>}
          <div className="form-grid">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="ph_renews">This policy renews</label>
              <select id="ph_renews" value={choice} onChange={(e) => setChoice(e.target.value)}>
                {(candidatesQuery.data?.candidates ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.policy_no || `#${c.id}`} · {c.insurer_name || "—"} · {c.start_date} to {c.end_date}{c.fits ? "" : " (number or dates differ)"}</option>
                ))}
                {term.renews_transaction_id && !(candidatesQuery.data?.candidates ?? []).some((c) => c.id === term.renews_transaction_id) && (
                  <option value={term.renews_transaction_id}>Current: #{term.renews_transaction_id}</option>
                )}
                <option value="none">Nothing on file (a new policy, or renewed from another broker)</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="ph_note">Note (optional)</label>
              <input id="ph_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Policy number changed at renewal" />
            </div>
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-sm" disabled={save.isPending || !choice} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table className="data-table">
          <thead><tr><th>Term</th><th>Policy</th><th>Insurer</th><th>Period</th><th>Status</th><th className="num">Premium</th></tr></thead>
          <tbody>
            {history.terms.map((t) => (
              <tr key={t.transaction_id}>
                <td>{t.term_no}{t.transaction_id === termTx ? " (this one)" : ""}</td>
                <td>{t.transaction_id === termTx ? (t.policy_no || `#${t.transaction_id}`) : <Link to={`/transactions/${t.transaction_id}`}>{t.policy_no || `#${t.transaction_id}`}</Link>}</td>
                <td>{t.insurer_name || "—"}</td>
                <td>{t.start_date} to {t.end_date}</td>
                <td>{t.status}{t.link_status === "Check" ? <div className="text-muted" style={{ fontSize: "0.8rem" }}>Link needs checking</div> : null}</td>
                <td className="num">{fmtMoney(t.premium_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
