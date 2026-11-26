import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { fmtMoney } from "@/shared/lib/format";

interface ClaimRow {
  id: number;
  claim_no: string;
  status: string;
  date_of_loss: string | null;
  date_reported: string | null;
  claimed_amount: number;
  approved_amount: number;
}

interface Policy {
  id: number;
  policy_no: string | null;
  class_of_business: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Response {
  claims: ClaimRow[];
  policies: Policy[];
  lossTypes: string[];
  relationshipTypes: string[];
}

const EMPTY_FORM = {
  transaction_id: "",
  date_of_loss: "",
  loss_type: "",
  location_of_loss: "",
  description: "",
  reported_by_name: "",
  relationship_to_insured: "Policyholder",
  reporter_phone: "",
  reporter_email: "",
  police_report_no: "",
  police_station: "",
  third_party_involved: false,
  third_party_details: "",
  claimed_amount: "",
};

export function PortalClaimsListPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "claims"],
    queryFn: () => api.get<Response>("/api/portal/claims"),
  });

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!form.description.trim()) {
      setError("Please describe what happened.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{ claimNo: string }>("/api/portal/claims", form);
      await queryClient.invalidateQueries({ queryKey: ["portal", "claims"] });
      setForm(EMPTY_FORM);
      setSuccess(
        `Claim reported — reference ${result.claimNo}. Your broker will review it and be in touch; you can attach photos or a police report from the claim's page.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>Claims</h1>
        </div>
      </div>

      <div className="card">
        <h2>Report a Claim / Loss</h2>
        {error && <div className="flash flash-error">{error}</div>}
        {success && <div className="flash flash-success">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="transaction_id">Policy (optional)</label>
              <select id="transaction_id" value={form.transaction_id} onChange={(e) => set("transaction_id", e.target.value)}>
                <option value="">— Not sure / other —</option>
                {data?.policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.policy_no || `#${p.id}`} — {p.class_of_business || "—"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="date_of_loss">Date of Loss</label>
              <input id="date_of_loss" type="date" value={form.date_of_loss} onChange={(e) => set("date_of_loss", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="loss_type">Type of Loss</label>
              <select id="loss_type" value={form.loss_type} onChange={(e) => set("loss_type", e.target.value)}>
                <option value="">— Select —</option>
                {data?.lossTypes.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="location_of_loss">Location of Loss</label>
              <input id="location_of_loss" value={form.location_of_loss} onChange={(e) => set("location_of_loss", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="description">What happened? *</label>
              <textarea id="description" rows={3} required value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="reported_by_name">Your Name</label>
              <input id="reported_by_name" value={form.reported_by_name} onChange={(e) => set("reported_by_name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="relationship_to_insured">Relationship to Insured</label>
              <select
                id="relationship_to_insured"
                value={form.relationship_to_insured}
                onChange={(e) => set("relationship_to_insured", e.target.value)}
              >
                {data?.relationshipTypes.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="reporter_phone">Your Phone</label>
              <input id="reporter_phone" value={form.reporter_phone} onChange={(e) => set("reporter_phone", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="reporter_email">Your Email</label>
              <input id="reporter_email" type="email" value={form.reporter_email} onChange={(e) => set("reporter_email", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="police_report_no">Police Report No (if any)</label>
              <input id="police_report_no" value={form.police_report_no} onChange={(e) => set("police_report_no", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="police_station">Police Station</label>
              <input id="police_station" value={form.police_station} onChange={(e) => set("police_station", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="third_party_involved">Was a Third Party Involved?</label>
              <select
                id="third_party_involved"
                value={form.third_party_involved ? "yes" : "no"}
                onChange={(e) => set("third_party_involved", e.target.value === "yes")}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {form.third_party_involved && (
              <div className="field span-2">
                <label htmlFor="third_party_details">Third Party / Witness Details</label>
                <input
                  id="third_party_details"
                  placeholder="Name, phone, vehicle reg, insurer, witnesses…"
                  value={form.third_party_details}
                  onChange={(e) => set("third_party_details", e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="claimed_amount">Estimated Loss Amount (optional)</label>
              <input
                id="claimed_amount"
                type="number"
                step="0.01"
                value={form.claimed_amount}
                onChange={(e) => set("claimed_amount", e.target.value)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Submitting…" : "Report Claim"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Your Claims</h2>
      </div>
      <DataGrid
        columns={
          [
            { key: "claim_no", header: "Claim No", render: (c) => <Link to={`/portal/claims/${c.id}`}>{c.claim_no}</Link> },
            { key: "date_of_loss", header: "Date of Loss", render: (c) => c.date_of_loss || "—" },
            { key: "date_reported", header: "Date Reported", render: (c) => c.date_reported || "—" },
            { key: "claimed", header: "Claimed", align: "right", render: (c) => fmtMoney(c.claimed_amount) },
            { key: "approved", header: "Approved", align: "right", render: (c) => fmtMoney(c.approved_amount) },
            { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
          ] as DataGridColumn<ClaimRow>[]
        }
        rows={data?.claims}
        isLoading={isLoading}
        getRowKey={(c) => c.id}
        emptyMessage="No claims on file."
      />
    </div>
  );
}
