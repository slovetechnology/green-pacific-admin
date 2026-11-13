import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { Modal } from "@/shared/components/exec/Modal";
import { GateNotice } from "./GateNotice";
import { describeError, missingOf, type FormOptions, type GateItem } from "../lib/types";

interface Candidate {
  client_id: number;
  name: string;
  lifecycle_stage: string | null;
  reasons: string[];
}

// Four fields to start a deal: who, what class, who owns it, where it came from.
// A new prospect is checked against existing clients as you type, and is only
// created once you have seen the matches.
export function QuickCreateDialog({
  open,
  options,
  initialClientId,
  onClose,
  onCreated,
}: {
  open: boolean;
  options: FormOptions | undefined;
  initialClientId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  return (
    <Modal open={open} title="New deal" onClose={onClose}>
      {options && <QuickCreateForm options={options} initialClientId={initialClientId} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function QuickCreateForm({ options, initialClientId, onClose, onCreated }: { options: FormOptions; initialClientId?: string; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prospect, setProspect] = useState(false);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [clientFilter, setClientFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [classOfBusiness, setClassOfBusiness] = useState("");
  const [ownerId, setOwnerId] = useState(user ? String(user.id) : "");
  const [source, setSource] = useState("");
  const [premium, setPremium] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; missing: GateItem[] } | null>(null);

  // Look for the prospect among existing clients while typing.
  useEffect(() => {
    if (!prospect || newName.trim().length < 3) return;
    const handle = window.setTimeout(async () => {
      try {
        const found = await api.get<{ candidates: Candidate[] }>(`/api/deals/client-matches?name=${encodeURIComponent(newName.trim())}`);
        setCandidates(found.candidates);
      } catch {
        setCandidates([]);
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [prospect, newName]);

  const visibleClients = options.clients.filter((c) => c.name.toLowerCase().includes(clientFilter.trim().toLowerCase())).slice(0, 200);
  const shownCandidates = prospect && newName.trim().length >= 3 ? candidates : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      class_of_business: classOfBusiness, owner_user_id: ownerId || undefined, source: source || undefined,
      estimated_premium: premium || undefined, expected_close_date: closeDate || undefined,
    };
    if (prospect) {
      body.new_client = { name: newName };
      if (confirmNew) body.confirm_new = true;
    } else {
      body.client_id = clientId;
    }
    try {
      const result = await api.post<{ dealId: number }>("/api/deals", body);
      onCreated();
      onClose();
      navigate(`/deals/${result.dealId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.data?.candidates)) {
        setCandidates(err.data.candidates as Candidate[]);
        setError({ message: err.message, missing: [] });
      } else {
        setError({ message: describeError(err), missing: missingOf(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  function pickClient(id: number) {
    setProspect(false);
    setClientId(String(id));
    setCandidates([]);
    setError(null);
  }

  return (
    <form onSubmit={submit} className="pl-form">
      <div className="pl-toggle" role="group" aria-label="Who is this deal for" style={{ alignSelf: "flex-start" }}>
        <button type="button" aria-pressed={!prospect} onClick={() => setProspect(false)}>Existing client</button>
        <button type="button" aria-pressed={prospect} onClick={() => setProspect(true)}>New prospect</button>
      </div>

      {prospect ? (
        <div className="field">
          <label htmlFor="qc-new">Prospect name</label>
          <input id="qc-new" value={newName} onChange={(e) => { setNewName(e.target.value); setConfirmNew(false); }} required autoComplete="off" />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="qc-client">Client</label>
          <input id="qc-filter" aria-label="Search clients" placeholder="Type to search…" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} autoComplete="off" />
          <select id="qc-client" value={clientId} onChange={(e) => setClientId(e.target.value)} required size={1}>
            <option value="">Choose a client…</option>
            {visibleClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {shownCandidates.length > 0 && (
        <div>
          <p className="pl-hint" style={{ marginBottom: "0.3rem" }}>We already know {shownCandidates.length === 1 ? "someone" : "some clients"} like this:</p>
          <ul className="pl-matches">
            {shownCandidates.map((c) => (
              <li key={c.client_id}>
                <span>{c.name} <span className="pl-chip">{c.reasons.join(", ")}</span></span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => pickClient(c.client_id)}>Use this client</button>
              </li>
            ))}
          </ul>
          <label className="pl-check" style={{ marginTop: "0.4rem" }}>
            <input type="checkbox" checked={confirmNew} onChange={(e) => setConfirmNew(e.target.checked)} /> It really is a different party, create it as new
          </label>
        </div>
      )}

      <div className="pl-grid-2">
        <div className="field">
          <label htmlFor="qc-class">Class of business</label>
          <input id="qc-class" list="qc-classes" value={classOfBusiness} onChange={(e) => setClassOfBusiness(e.target.value)} required />
          <datalist id="qc-classes">
            {options.classes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="qc-owner">Owner</label>
          <select id="qc-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
            {options.owners.map((o) => (
              <option key={o.id} value={o.id}>{o.username}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qc-source">Where did it come from?</label>
          <select id="qc-source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Not recorded</option>
            {options.sources.filter((s) => s !== "Sub-broker" && s !== "Campaign" && s !== "Renewal" && s !== "Portal Quote Request" && s !== "Website Quote Request").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qc-premium">Estimated premium (₦, optional)</label>
          <input id="qc-premium" type="number" min="0" step="0.01" value={premium} onChange={(e) => setPremium(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qc-close">Expected close (optional)</label>
          <input id="qc-close" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </div>
      </div>
      <p className="pl-hint">Everything else (risk details, insurers, quotes) is added on the deal as it moves forward. Sub-broker and campaign sources are set there.</p>

      {error && <GateNotice message={error.message} items={error.missing} tone="crit" />}
      <div className="pl-modal-foot">
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-sm" disabled={busy || (prospect && shownCandidates.length > 0 && !confirmNew)}>
          {busy ? "Creating…" : "Create deal"}
        </button>
      </div>
    </form>
  );
}
