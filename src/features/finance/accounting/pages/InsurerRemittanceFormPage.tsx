import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmAction } from "@/shared/components/ConfirmDialog";

interface FormOptions {
  insurers: { id: number; name: string }[];
  clients: { id: number; name: string }[];
  statuses: string[];
}

interface Remittance {
  id: number;
  insurer_id: number;
  client_id: number | null;
  client_name: string | null;
  credit_note_no: string | null;
  period_start: string;
  period_end: string;
  gross_premium: number;
  commission: number;
  net_premium: number;
  status: string;
  remitted_date: string | null;
  reference_no: string | null;
  notes: string | null;
}

const today = new Date().toISOString().slice(0, 10);

export function InsurerRemittanceFormPage() {
  const { remittanceId } = useParams();
  const isEdit = Boolean(remittanceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [insurerId, setInsurerId] = useState("");
  const [clientId, setClientId] = useState("");
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [grossPremium, setGrossPremium] = useState("0");
  const [commission, setCommission] = useState("0");
  const [netPremium, setNetPremium] = useState("0");
  const [status, setStatus] = useState("Unremitted");
  const [remittedDate, setRemittedDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["insurer-remittances", "meta"],
    queryFn: () => api.get<FormOptions>("/api/insurer-remittances/meta/form-options"),
  });

  const editQuery = useQuery({
    queryKey: ["insurer-remittances", remittanceId],
    queryFn: () => api.get<{ remittance: Remittance }>(`/api/insurer-remittances/${remittanceId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (isEdit && editQuery.data) {
      const r = editQuery.data.remittance;
      setInsurerId(String(r.insurer_id));
      setClientId(r.client_id ? String(r.client_id) : "");
      setCreditNoteNo(r.credit_note_no || "");
      setPeriodStart(r.period_start.slice(0, 10));
      setPeriodEnd(r.period_end.slice(0, 10));
      setGrossPremium(String(r.gross_premium));
      setCommission(String(r.commission));
      setNetPremium(String(r.net_premium));
      setStatus(r.status);
      setRemittedDate(r.remitted_date ? r.remitted_date.slice(0, 10) : "");
      setReferenceNo(r.reference_no || "");
      setNotes(r.notes || "");
    }
  }, [isEdit, editQuery.data]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload = {
      insurer_id: insurerId, period_start: periodStart, period_end: periodEnd,
      client_id: clientId || null, credit_note_no: creditNoteNo || null,
      gross_premium: grossPremium, commission, net_premium: netPremium,
      status, remitted_date: remittedDate || null, reference_no: referenceNo, notes,
    };
    try {
      if (isEdit) {
        await api.put(`/api/insurer-remittances/${remittanceId}`, payload);
      } else {
        await api.post("/api/insurer-remittances", payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["insurer-remittances"] });
      navigate("/insurer-remittances");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirmAction("Delete this remittance record? This cannot be undone.")) return;
    await api.delete(`/api/insurer-remittances/${remittanceId}`);
    await queryClient.invalidateQueries({ queryKey: ["insurer-remittances"] });
    navigate("/insurer-remittances");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>{isEdit ? "Edit Remittance" : "Log Remittance"}</h1>
        </div>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="section-title">Remittance details</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="insurer_id">Insurer</label>
              <select id="insurer_id" required value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
                <option value="">— Select —</option>
                {(optionsQuery.data?.insurers || []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="client_id">Client</label>
              <select id="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— Select —</option>
                {(optionsQuery.data?.clients || []).map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="credit_note_no">Credit note number</label>
              <input id="credit_note_no" value={creditNoteNo} onChange={(e) => setCreditNoteNo(e.target.value)} />
            </div>
          </div>

          <div className="section-title">Period and premium</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="period_start">Period start</label>
              <input id="period_start" type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="period_end">Period end</label>
              <input id="period_end" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="gross_premium">Gross premium</label>
              <input id="gross_premium" type="number" step="0.01" min="0" value={grossPremium} onChange={(e) => setGrossPremium(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="commission">Commission</label>
              <input id="commission" type="number" step="0.01" min="0" value={commission} onChange={(e) => setCommission(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="net_premium">Net premium (due to insurer)</label>
              <input id="net_premium" type="number" step="0.01" min="0" value={netPremium} onChange={(e) => setNetPremium(e.target.value)} />
            </div>
          </div>

          <div className="section-title">Settlement</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {(optionsQuery.data?.statuses || ["Unremitted", "Remitted"]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="remitted_date">Remitted date</label>
              <input id="remitted_date" type="date" value={remittedDate} onChange={(e) => setRemittedDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="reference_no">Reference</label>
              <input id="reference_no" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <div className="field span-3">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate("/insurer-remittances")}>
              Cancel
            </button>
            {isEdit && (
              <button type="button" className="btn-danger btn" onClick={handleDelete} style={{ marginLeft: "auto" }}>
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
