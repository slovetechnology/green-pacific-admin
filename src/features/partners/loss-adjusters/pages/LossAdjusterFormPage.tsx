import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import type { LossAdjusterRow } from "./LossAdjustersListPage";

const STATUSES = ["Not verified", "Active", "Expired", "Suspended"];
const EMPTY = {
  name: "",
  contact_person: "",
  address: "",
  office_phone: "",
  mobile_phone: "",
  email: "",
  website: "",
  licence_no: "",
  licence_status: "Not verified",
  source: "",
  notes: "",
};
type FormState = typeof EMPTY;

export function LossAdjusterFormPage() {
  const { lossAdjusterId } = useParams();
  const isEdit = Boolean(lossAdjusterId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const editQuery = useQuery({
    queryKey: ["loss-adjusters", "one", lossAdjusterId],
    queryFn: () => api.get<{ lossAdjuster: LossAdjusterRow }>(`/api/loss-adjusters/${lossAdjusterId}`),
    enabled: isEdit,
  });

  // Assigned by the server when the firm is added (LA-001, ...); shown, never edited.
  const adjusterRef = editQuery.data?.lossAdjuster.adjuster_ref ?? null;

  useEffect(() => {
    const r = editQuery.data?.lossAdjuster;
    if (!r) return;
    const next = { ...EMPTY };
    for (const key of Object.keys(EMPTY) as (keyof FormState)[]) next[key] = String(r[key] ?? "");
    setForm(next);
    setIsActive(Boolean(r.is_active));
  }, [editQuery.data]);

  const field = (key: keyof FormState) => ({
    id: key,
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = { ...form, is_active: isActive };
      if (isEdit) await api.put(`/api/loss-adjusters/${lossAdjusterId}`, payload);
      else await api.post("/api/loss-adjusters", payload);
      await queryClient.invalidateQueries({ queryKey: ["loss-adjusters"] });
      navigate("/loss-adjusters");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${form.name}? Claims that already name this adjuster keep their details.`)) return;
    try {
      await api.delete(`/api/loss-adjusters/${lossAdjusterId}`);
      await queryClient.invalidateQueries({ queryKey: ["loss-adjusters"] });
      navigate("/loss-adjusters");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this loss adjuster.");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? "Edit Loss Adjuster" : "New Loss Adjuster"}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field span-3">
              <label htmlFor="adjuster_ref">Reference</label>
              <input id="adjuster_ref" value={adjusterRef || "Assigned when saved"} readOnly disabled />
            </div>
            <div className="field span-2">
              <label htmlFor="name">Firm name</label>
              <input required {...field("name")} />
            </div>
            <div className="field">
              <label htmlFor="contact_person">Contact person</label>
              <input {...field("contact_person")} />
            </div>
            <div className="field span-3">
              <label htmlFor="address">Office address</label>
              <textarea rows={2} {...field("address")} />
            </div>
            <div className="field">
              <label htmlFor="office_phone">Office phone</label>
              <input {...field("office_phone")} />
            </div>
            <div className="field">
              <label htmlFor="mobile_phone">Mobile phone</label>
              <input {...field("mobile_phone")} />
            </div>
            <div className="field">
              <label htmlFor="website">Website</label>
              <input {...field("website")} />
            </div>
            <div className="field span-3">
              <label htmlFor="email">Official email</label>
              <input {...field("email")} placeholder="info@firm.com (separate several with commas)" />
            </div>
            <div className="field">
              <label htmlFor="licence_no">NAICOM licence no.</label>
              <input {...field("licence_no")} />
            </div>
            <div className="field">
              <label htmlFor="licence_status">Licence status</label>
              <select {...field("licence_status")}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="source">Source</label>
              <input {...field("source")} placeholder="Where these details came from" />
            </div>
            <div className="field span-3">
              <label htmlFor="notes">Notes</label>
              <textarea rows={2} {...field("notes")} />
            </div>
            <div className="field span-3">
              <label>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Offer this
                firm when assigning an adjuster to a claim
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add loss adjuster"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
            {isEdit && (
              <RoleGate need="write">
                <button type="button" className="btn-secondary btn" onClick={handleDelete}>
                  Delete
                </button>
              </RoleGate>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
