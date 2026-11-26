import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";

// A client's consent (backend compliance/privacy): current answer per purpose, and recording a new one from a signed
// form, the portal, an email or a call. Each change is a new record; the history is the evidence.
interface Current { purpose: string; granted: boolean | null; since: string | null; method: string | null }
interface Consents { current: Current[]; history: { id: number; purpose: string; granted: number; method: string; evidence: string | null; recorded_by: string; recorded_at: string }[]; purposes: string[]; methods: string[] }

export function ClientConsentPanel({ clientId }: { clientId: number }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["data-protection", "consents", clientId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<Consents>(`/api/data-protection/clients/${clientId}/consents`), retry: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [granted, setGranted] = useState("1");
  const [method, setMethod] = useState("Signed proposal");
  const [evidence, setEvidence] = useState("");
  const save = useMutation({
    mutationFn: () => api.post(`/api/data-protection/clients/${clientId}/consents`, { purpose: editing, granted: granted === "1", method, evidence }),
    onSuccess: () => { setEditing(null); void queryClient.invalidateQueries({ queryKey: key }); },
  });
  if (!data) return null;
  return (
    <div className="card">
      <h2>Consent</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Purpose</th><th>Answer</th><th>Since</th><th></th></tr></thead>
          <tbody>
            {data.current.map((c) => (
              <tr key={c.purpose}>
                <td>{c.purpose}</td>
                <td>{c.granted === null ? <span className="text-muted">Not recorded</span> : c.granted ? <span className="badge badge-paid">Given</span> : <span className="badge badge-unpaid">Withdrawn</span>}</td>
                <td>{c.since ? `${c.since.slice(0, 10)} (${c.method})` : "—"}</td>
                <td>{user?.canWrite && <button type="button" className="btn btn-sm btn-secondary" onClick={() => { save.reset(); setEditing(c.purpose); setGranted(c.granted === false ? "1" : c.granted ? "0" : "1"); setEvidence(""); }}>Record</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate style={{ marginTop: "0.75rem" }}>
          {save.isError && <div className="flash flash-error">{(save.error as Error).message}</div>}
          <div className="form-grid">
            <div className="field"><label htmlFor="cs_answer">{editing}</label><select id="cs_answer" value={granted} onChange={(e) => setGranted(e.target.value)}><option value="1">Consent given</option><option value="0">Consent withdrawn</option></select></div>
            <div className="field"><label htmlFor="cs_method">How</label><select id="cs_method" value={method} onChange={(e) => setMethod(e.target.value)}>{data.methods.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label htmlFor="cs_evidence">Evidence</label><input id="cs_evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. proposal form signed 12 Nov" /></div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={save.isPending}>Save</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
