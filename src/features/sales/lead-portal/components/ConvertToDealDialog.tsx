// Turns a lead into a Lead-stage deal in the sales pipeline (POST /api/lead-portal/leads/:id/convert).
// The deal rules are the pipeline's own: a prospect that looks like a client we already know is refused
// with 409 and the matches, and the person picks one or confirms it is new.
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api as erpApi, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { api, type Lead } from "../api";
import { ErrorNote, Modal } from "./ui";

interface FormOptions {
  clients: { id: number; name: string; lifecycle_stage: string | null }[];
  owners: { id: number; username: string }[];
  classes: string[];
}
interface Candidate {
  client_id: number;
  name: string;
  lifecycle_stage: string | null;
  reasons: string[];
}
interface Missing {
  message: string;
}

export function ConvertToDealDialog({ lead, onClose, onDone }: { lead: Lead; onClose: () => void; onDone: (dealId: number) => void }) {
  const { user } = useAuth();
  const options = useQuery({ queryKey: ["lead-portal", "deal-form-options"], queryFn: () => erpApi.get<FormOptions>("/api/deals/meta/form-options"), staleTime: 60_000 });
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [prospectName, setProspectName] = useState(lead.company);
  const [clientId, setClientId] = useState("");
  const [classOfBusiness, setClassOfBusiness] = useState("");
  const [ownerId, setOwnerId] = useState(String(user?.id ?? ""));
  const [premium, setPremium] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMissing([]);
    setSaving(true);
    try {
      const body = {
        ...(clientMode === "existing" ? { client_id: Number(clientId) } : { new_client: { name: prospectName.trim() }, confirm_new: confirmNew }),
        class_of_business: classOfBusiness,
        owner_user_id: ownerId ? Number(ownerId) : undefined,
        estimated_premium: premium ? Number(premium) : undefined,
        expected_close_date: closeDate || undefined,
      };
      const r = await api.post<{ dealId: number }>(`/leads/${lead.id}/convert`, body);
      onDone(r.dealId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.data?.candidates)) {
        setCandidates(err.data.candidates as Candidate[]);
        setError(err);
      } else if (err instanceof ApiError && err.status === 422 && Array.isArray(err.data?.missing)) {
        setMissing((err.data.missing as Missing[]).map((m) => m.message));
      } else {
        setError(err);
      }
    } finally {
      setSaving(false);
    }
  }

  const pickClient = (c: Candidate) => {
    setClientMode("existing");
    setClientId(String(c.client_id));
    setCandidates([]);
    setError(null);
  };

  return (
    <Modal title="Add to the sales pipeline" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small" style={{ margin: 0 }}>
          Creates a deal at the <strong>Lead</strong> stage, with this lead as its source. It then follows the normal pipeline steps (KYC, quotes, proposal).
        </p>
        <div className="row gap">
          <label className="check"><input type="radio" checked={clientMode === "new"} onChange={() => setClientMode("new")} /> New prospect</label>
          <label className="check"><input type="radio" checked={clientMode === "existing"} onChange={() => setClientMode("existing")} /> Existing client</label>
        </div>
        {clientMode === "new" ? (
          <label>
            Prospect name
            <input value={prospectName} onChange={(e) => { setProspectName(e.target.value); setCandidates([]); setConfirmNew(false); }} required minLength={2} maxLength={250} />
          </label>
        ) : (
          <label>
            Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Choose…</option>
              {options.data?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.lifecycle_stage ? ` (${c.lifecycle_stage})` : ""}</option>)}
            </select>
          </label>
        )}

        {candidates.length ? (
          <div className="alert alert-warn">
            <strong>This looks like a client we already know.</strong> Use one of these, or confirm the prospect is new.
            <ul className="contacts">
              {candidates.slice(0, 6).map((c) => (
                <li key={c.client_id}>
                  {c.name}{c.lifecycle_stage ? <span className="muted"> · {c.lifecycle_stage}</span> : null}{" "}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickClient(c)}>Use this client</button>
                </li>
              ))}
            </ul>
            <label className="check"><input type="checkbox" checked={confirmNew} onChange={(e) => setConfirmNew(e.target.checked)} /> It is a new prospect</label>
          </div>
        ) : null}

        <div className="lp-form-grid">
          <label>
            Class of business
            <select value={classOfBusiness} onChange={(e) => setClassOfBusiness(e.target.value)} required>
              <option value="">Choose…</option>
              {options.data?.classes.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Owner
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
              <option value="">Choose…</option>
              {options.data?.owners.map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
            </select>
          </label>
          <label>
            Estimated premium (₦, optional)
            <input type="number" min={0} step="any" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </label>
          <label>
            Expected close (optional)
            <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
          </label>
        </div>

        {missing.length ? (
          <div className="alert alert-danger">
            <ul className="contacts">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
        {!candidates.length ? <ErrorNote error={error} /> : null}
        <div className="row gap">
          <button className="btn" disabled={saving || (candidates.length > 0 && clientMode === "new" && !confirmNew)}>{saving ? "Adding…" : "Add to pipeline"}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
