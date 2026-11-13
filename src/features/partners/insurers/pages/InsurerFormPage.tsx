import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

const INSURER_CLASSES = ["Non-Life", "Life", "Composite", "Reinsurance"];

export function InsurerFormPage() {
  const { insurerId } = useParams();
  const isEdit = Boolean(insurerId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  // Billing mode new policies with this insurer start with (backend lib/transactions.js).
  const [defaultBillingMode, setDefaultBillingMode] = useState("Agency");
  // Website quote requests that name this insurer are copied here.
  const [quoteEmail, setQuoteEmail] = useState("");
  const [licenceNo, setLicenceNo] = useState("");
  const [insurerClass, setInsurerClass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const editQuery = useQuery({
    queryKey: ["insurers", insurerId],
    queryFn: () =>
      api.get<{ insurer: { name: string; address: string | null; default_billing_mode?: string; quote_email?: string | null; licence_no?: string | null; insurer_class?: string | null } }>(`/api/insurers/${insurerId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (editQuery.data) {
      setName(editQuery.data.insurer.name);
      setAddress(editQuery.data.insurer.address || "");
      setDefaultBillingMode(editQuery.data.insurer.default_billing_mode || "Agency");
      setQuoteEmail(editQuery.data.insurer.quote_email || "");
      setLicenceNo(editQuery.data.insurer.licence_no || "");
      setInsurerClass(editQuery.data.insurer.insurer_class || "");
    }
  }, [editQuery.data]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/api/insurers/${insurerId}`, { name, address, default_billing_mode: defaultBillingMode, quote_email: quoteEmail, licence_no: licenceNo, insurer_class: insurerClass });
      } else {
        await api.post("/api/insurers", { name, address, default_billing_mode: defaultBillingMode, quote_email: quoteEmail, licence_no: licenceNo, insurer_class: insurerClass });
      }
      await queryClient.invalidateQueries({ queryKey: ["insurers"] });
      navigate(isEdit ? `/insurers/${insurerId}` : "/insurers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? "Edit Insurer" : "New Insurer"}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="name">Name</label>
              <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="licence_no">Licence No.</label>
              <input id="licence_no" value={licenceNo} onChange={(e) => setLicenceNo(e.target.value)} placeholder="e.g. LIC015" />
            </div>
            <div className="field span-3">
              <label htmlFor="address">Address</label>
              <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="insurer_class">Class</label>
              <select id="insurer_class" value={insurerClass} onChange={(e) => setInsurerClass(e.target.value)}>
                <option value="">Not recorded</option>
                {INSURER_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field span-2">
              <label htmlFor="default_billing_mode">Default billing for new policies</label>
              <select id="default_billing_mode" value={defaultBillingMode} onChange={(e) => setDefaultBillingMode(e.target.value)}>
                <option value="Agency">Agency Bill (we collect the premium)</option>
                <option value="Direct">Direct Bill (insurer collects the premium)</option>
              </select>
            </div>
            <div className="field span-3">
              <label htmlFor="quote_email">Quote request email</label>
              <input
                id="quote_email"
                value={quoteEmail}
                onChange={(e) => setQuoteEmail(e.target.value)}
                placeholder="underwriting@insurer.com (separate several with commas)"
              />
              <p className="field-hint">Website quote requests where the client picks this insurer are copied to this address.</p>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add insurer"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
