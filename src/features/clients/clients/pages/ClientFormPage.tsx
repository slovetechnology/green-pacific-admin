import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface ClientOption {
  id: number;
  name: string;
}

interface ClientFormValues {
  name: string;
  address: string;
  city: string;
  state: string;
  assigned_broker_name: string;
  assigned_broker_phone: string;
  assigned_broker_email: string;
  office_location: string;
  parent_client_id: string;
  account_type: string;
  industry_sic: string;
  industry_naics: string;
  lifecycle_stage: string;
  // The user who owns this client. An 'agent' sees only the clients they
  // own (backend lib/scope.js).
  account_manager_user_id: string;
  branch_id: string;
}

interface OwnershipOptions {
  accountManagers: { id: number; username: string; role: string }[];
  branches: { id: number; name: string }[];
}

const EMPTY: ClientFormValues = {
  name: "",
  address: "",
  city: "",
  state: "",
  assigned_broker_name: "",
  assigned_broker_phone: "",
  assigned_broker_email: "",
  office_location: "",
  parent_client_id: "",
  account_type: "Standalone",
  industry_sic: "",
  industry_naics: "",
  lifecycle_stage: "Prospect",
  account_manager_user_id: "",
  branch_id: "",
};

export function ClientFormPage() {
  const { clientId } = useParams();
  const isEdit = Boolean(clientId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ClientFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["clients", "options"],
    queryFn: () =>
      api.get<{ clients: ClientOption[]; accountTypes: string[]; lifecycleStages: string[] } & OwnershipOptions>("/api/clients/options"),
  });

  const editQuery = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => api.get<{ client: Record<string, unknown>; parentOptions: ClientOption[] }>(`/api/clients/${clientId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (isEdit && editQuery.data) {
      const c = editQuery.data.client;
      setValues({
        name: String(c.name ?? ""),
        address: String(c.address ?? ""),
        city: String(c.city ?? ""),
        state: String(c.state ?? ""),
        assigned_broker_name: String(c.assigned_broker_name ?? ""),
        assigned_broker_phone: String(c.assigned_broker_phone ?? ""),
        assigned_broker_email: String(c.assigned_broker_email ?? ""),
        office_location: String(c.office_location ?? ""),
        parent_client_id: c.parent_client_id ? String(c.parent_client_id) : "",
        account_type: String(c.account_type ?? "Standalone"),
        industry_sic: String(c.industry_sic ?? ""),
        industry_naics: String(c.industry_naics ?? ""),
        lifecycle_stage: String(c.lifecycle_stage ?? "Prospect"),
        account_manager_user_id: c.account_manager_user_id ? String(c.account_manager_user_id) : "",
        branch_id: c.branch_id ? String(c.branch_id) : "",
      });
    }
  }, [isEdit, editQuery.data]);

  const accountTypes = optionsQuery.data?.accountTypes || ["Standalone", "Parent", "Subsidiary", "Job Site"];
  const lifecycleStages = optionsQuery.data?.lifecycleStages || ["Prospect", "Active Client", "Lost", "Former Client"];
  const parentOptions = isEdit ? editQuery.data?.parentOptions || [] : optionsQuery.data?.clients || [];

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/api/clients/${clientId}`, values);
      } else {
        const result = await api.post<{ client: { id: number } }>("/api/clients", values);
        await queryClient.invalidateQueries({ queryKey: ["clients"] });
        navigate(`/clients/${result.client.id}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      navigate(`/clients/${clientId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? "Edit Client" : "New Client"}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="section-title">Client details</div>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="name">Name</label>
              <input id="name" required value={values.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input id="state" value={values.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="address">Address</label>
              <input id="address" value={values.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" value={values.city} onChange={(e) => set("city", e.target.value)} />
            </div>
          </div>

          <div className="section-title">Broker &amp; account</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="account_manager_user_id">Account manager</label>
              <select
                id="account_manager_user_id"
                value={values.account_manager_user_id}
                onChange={(e) => set("account_manager_user_id", e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {(optionsQuery.data?.accountManagers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                    {u.role === "agent" ? " (agent)" : ""}
                  </option>
                ))}
              </select>
              <small>The login that owns this client. Agents see only the clients they own.</small>
            </div>
            <div className="field">
              <label htmlFor="branch_id">Branch</label>
              <select id="branch_id" value={values.branch_id} onChange={(e) => set("branch_id", e.target.value)}>
                <option value="">—</option>
                {(optionsQuery.data?.branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="assigned_broker_name">Broker contact name (printed on documents)</label>
              <input
                id="assigned_broker_name"
                value={values.assigned_broker_name}
                onChange={(e) => set("assigned_broker_name", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="assigned_broker_phone">Broker phone</label>
              <input
                id="assigned_broker_phone"
                value={values.assigned_broker_phone}
                onChange={(e) => set("assigned_broker_phone", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="assigned_broker_email">Broker email</label>
              <input
                id="assigned_broker_email"
                type="text"
                value={values.assigned_broker_email}
                onChange={(e) => set("assigned_broker_email", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="office_location">Office location</label>
              <input
                id="office_location"
                value={values.office_location}
                onChange={(e) => set("office_location", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="account_type">Account type</label>
              <select id="account_type" value={values.account_type} onChange={(e) => set("account_type", e.target.value)}>
                {accountTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lifecycle_stage">Lifecycle stage</label>
              <select
                id="lifecycle_stage"
                value={values.lifecycle_stage}
                onChange={(e) => set("lifecycle_stage", e.target.value)}
              >
                {lifecycleStages.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="parent_client_id">Parent client</label>
              <select
                id="parent_client_id"
                value={values.parent_client_id}
                onChange={(e) => set("parent_client_id", e.target.value)}
              >
                <option value="">— None —</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="industry_sic">Industry (SIC)</label>
              <input id="industry_sic" value={values.industry_sic} onChange={(e) => set("industry_sic", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="industry_naics">Industry (NAICS)</label>
              <input
                id="industry_naics"
                value={values.industry_naics}
                onChange={(e) => set("industry_naics", e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add client"}
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
