import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Modal } from "@/shared/components/exec/Modal";
import { useAuth } from "@/features/platform/auth/AuthContext";
import "@/shared/styles/pipeline.css";

// Compliance > Sanctions screening (backend compliance/sanctions). Clients, KYC applicants and the company's officers
// are screened against the UN, US OFAC and UK sanctions lists, which are downloaded daily. A potential match waits
// here until an admin or compliance officer marks it a false positive or a confirmed match, with a note.

interface Hit {
  entry_id: number;
  matched_name: string;
  score: number;
  source: string;
  source_ref: string;
  entity_type: string;
  primary_name: string;
  programme: string | null;
  nationality: string | null;
  dob: string | null;
}
interface Screening {
  id: number;
  subject_type: "client" | "kyc" | "officer";
  subject_id: number;
  subject_name: string;
  screened_at: string;
  result: "Clear" | "Potential match";
  review_status: "Not needed" | "Pending" | "False positive" | "Confirmed match";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  hits: Hit[];
}
interface Load { id: number; status: "Loaded" | "Unchanged" | "Failed"; entry_count: number; name_count: number; fetched_at: string; error: string | null }
interface Overview {
  loads: { source: string; label: string; last_attempt: Load | null; in_use: Load | null }[];
  counts: { subjects: number; pending: number; confirmed: number; falsePositive: number };
  enabled: boolean;
  screenings: Screening[];
  canReview: boolean;
  refreshing: boolean;
}

const SUBJECT_LABEL = { client: "Client", kyc: "KYC applicant", officer: "Corporate officer" };
const subjectLink = (s: Screening) => (s.subject_type === "client" ? `/clients/${s.subject_id}` : s.subject_type === "kyc" ? `/kyc-submissions/${s.subject_id}` : "/compliance/statutory-registers");
const REVIEW_BADGE: Record<Screening["review_status"], string> = {
  "Not needed": "badge badge-paid", Pending: "badge badge-warning", "False positive": "badge badge-secondary", "Confirmed match": "badge badge-unpaid",
};

export function SanctionsScreeningPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("attention");
  const { data, isLoading } = useQuery({ queryKey: ["sanctions", filter], queryFn: () => api.get<Overview>(`/api/sanctions?filter=${filter}`), refetchInterval: (q) => (q.state.data?.refreshing ? 10000 : false) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sanctions"] });
  const [notice, setNotice] = useState<string | null>(null);

  const update = useMutation({ mutationFn: () => api.post("/api/sanctions/refresh"), onSuccess: () => { setNotice("Downloading the lists. Screening runs when they are in; this page updates by itself."); void refresh(); } });
  // Check a name
  const [name, setName] = useState("");
  const check = useMutation({ mutationFn: () => api.post<{ hits: Hit[] }>("/api/sanctions/check", { name }) });
  // Review
  const [reviewing, setReviewing] = useState<Screening | null>(null);
  const [decision, setDecision] = useState<"False positive" | "Confirmed match">("False positive");
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: () => api.post(`/api/sanctions/screenings/${reviewing!.id}/review`, { decision, note }),
    onSuccess: () => { setReviewing(null); void refresh(); },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>Sanctions screening</h1>
          <p className="text-muted">Clients, KYC applicants and corporate officers are checked against the UN, US OFAC and UK sanctions lists. The lists are downloaded daily; new and renamed names are screened within 10 minutes.</p>
        </div>
      </div>
      {notice && <div className="flash flash-success">{notice}</div>}

      <div className="card">
        <h2>Lists</h2>
        {!data?.enabled && data && <div className="flash flash-error">List downloads are switched off on this server (SANCTIONS_LISTS=false).</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>List</th><th className="num">Entries</th><th className="num">Names and aliases</th><th>In use since</th><th>Last check</th></tr></thead>
            <tbody>
              {data?.loads.map((l) => (
                <tr key={l.source}>
                  <td><strong>{l.source}</strong><div className="text-muted" style={{ fontSize: "0.8rem" }}>{l.label}</div></td>
                  <td className="num">{l.in_use ? l.in_use.entry_count.toLocaleString() : "—"}</td>
                  <td className="num">{l.in_use ? l.in_use.name_count.toLocaleString() : "—"}</td>
                  <td>{l.in_use ? l.in_use.fetched_at : "Not loaded yet"}</td>
                  <td>
                    {l.last_attempt ? <>{l.last_attempt.fetched_at} · <span className={l.last_attempt.status === "Failed" ? "badge badge-unpaid" : "badge badge-paid"}>{l.last_attempt.status}</span></> : "—"}
                    {l.last_attempt?.error && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{l.last_attempt.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {user?.isAdmin && (
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" disabled={update.isPending || data?.refreshing} onClick={() => update.mutate()}>
              {data?.refreshing ? "Downloading lists…" : "Update lists now"}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Check a name</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) check.mutate(); }} noValidate style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input aria-label="Name to check" value={name} onChange={(e) => setName(e.target.value)} placeholder="A person or company, e.g. before onboarding" style={{ flex: "1 1 18rem" }} />
          <button type="submit" className="btn" disabled={check.isPending}>Check</button>
        </form>
        {check.isError && <div className="flash flash-error">{(check.error as Error).message}</div>}
        {check.data && (check.data.hits.length === 0
          ? <p><span className="badge badge-paid">No match</span> on the lists in use.</p>
          : <HitList hits={check.data.hits} />)}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Screening results</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }} aria-label="Show">
            <option value="attention">Needing attention</option>
            <option value="matches">Every potential match</option>
            <option value="all">Everyone screened</option>
          </select>
        </div>
        {data && (
          <p className="text-muted">
            {data.counts.subjects} screened · <strong>{data.counts.pending}</strong> to review · {data.counts.confirmed} confirmed · {data.counts.falsePositive} false positive{data.counts.falsePositive === 1 ? "" : "s"}
          </p>
        )}
        {isLoading && <p>Loading…</p>}
        {data && data.screenings.length === 0 && <p>Nothing here.</p>}
        {data?.screenings.map((s) => (
          <div key={s.id} style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
              <div>
                <strong><Link to={subjectLink(s)}>{s.subject_name}</Link></strong>{" "}
                <span className="text-muted">{SUBJECT_LABEL[s.subject_type]} · screened {s.screened_at}</span>
                <div><span className={REVIEW_BADGE[s.review_status]}>{s.result === "Clear" ? "Clear" : s.review_status}</span>
                  {s.reviewed_by && <span className="text-muted" style={{ fontSize: "0.8rem" }}> by {s.reviewed_by}{s.review_note ? `: ${s.review_note}` : ""}</span>}
                </div>
              </div>
              {data.canReview && s.result === "Potential match" && (
                <button type="button" className="btn btn-sm" onClick={() => { review.reset(); setDecision("False positive"); setNote(""); setReviewing(s); }}>
                  {s.review_status === "Pending" ? "Review" : "Change decision"}
                </button>
              )}
            </div>
            {s.hits.length > 0 && <HitList hits={s.hits} />}
          </div>
        ))}
      </div>

      <Modal open={reviewing !== null} wide title={`Review: ${reviewing?.subject_name ?? ""}`} onClose={() => setReviewing(null)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setReviewing(null)}>Cancel</button>
        <button type="button" className={decision === "Confirmed match" ? "btn btn-danger" : "btn"} disabled={review.isPending || !note.trim()} onClick={() => review.mutate()}>Save decision</button>
      </>}>
        {review.isError && <div className="flash flash-error">{(review.error as Error).message}</div>}
        {reviewing && <HitList hits={reviewing.hits} />}
        <div className="field">
          <label htmlFor="sx_decision">Decision</label>
          <select id="sx_decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            <option>False positive</option>
            <option>Confirmed match</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sx_note">How you decided (required)</label>
          <textarea id="sx_note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Date of birth and nationality differ from the listed person" />
        </div>
        {decision === "Confirmed match" && <p className="text-muted">A confirmed match must not be onboarded or paid. Report it to the NFIU (Compliance &gt; Statutory registers, AML filings) and stop any transaction.</p>}
      </Modal>
    </div>
  );
}

function HitList({ hits }: { hits: Hit[] }) {
  return (
    <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
      {hits.map((h) => (
        <li key={h.entry_id} style={{ marginBottom: "0.3rem" }}>
          <strong>{h.primary_name}</strong>{h.matched_name !== h.primary_name ? ` (as "${h.matched_name}")` : ""} · {Math.round(h.score * 100)}% ·{" "}
          {h.source} {h.source_ref} · {h.entity_type}
          {[h.nationality, h.dob && `born ${h.dob}`, h.programme].filter(Boolean).length > 0 && (
            <div className="text-muted" style={{ fontSize: "0.8rem" }}>{[h.nationality, h.dob && `born ${h.dob}`, h.programme].filter(Boolean).join(" · ")}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
