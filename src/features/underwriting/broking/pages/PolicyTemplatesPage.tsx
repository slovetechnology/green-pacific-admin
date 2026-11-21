import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import {
  createPolicyTemplate,
  fetchPolicyTemplates,
  retirePolicyTemplate,
  updatePolicyTemplate,
  type PolicyTemplate,
  type PolicyTemplatePayload,
} from "../api/policyTemplates";
import { confirmDialog } from "@/shared/components/Dialogs";

const EMPTY: PolicyTemplatePayload = { classOfBusiness: "", title: "", preamble: "", operativeClause: "", footerNote: "" };

export function PolicyTemplatesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PolicyTemplatePayload>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["transactions", "meta"],
    queryFn: () => api.get<{ classes: string[] }>("/api/transactions/meta/form-options"),
  });
  const listQuery = useQuery({ queryKey: ["policyTemplates"], queryFn: fetchPolicyTemplates });

  const saveMutation = useMutation({
    mutationFn: (payload: PolicyTemplatePayload) => (editingId ? updatePolicyTemplate(editingId, payload) : createPolicyTemplate(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policyTemplates"] });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
      setError(null);
    },
    onError: (err: Error) => setError(err.message || "Failed to save template"),
  });
  const retireMutation = useMutation({
    mutationFn: (id: number) => retirePolicyTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["policyTemplates"] }),
  });

  const templates = (listQuery.data?.templates ?? []).filter((t) => t.status !== "Retired");
  const fallback = listQuery.data?.defaultTemplate;
  const usedClasses = new Set(templates.map((t) => t.class_of_business));
  const classes = (optionsQuery.data?.classes ?? []).filter((c) => !usedClasses.has(c));

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY, preamble: fallback?.preamble ?? "", operativeClause: fallback?.operative_clause ?? "", footerNote: fallback?.footer_note ?? "" });
    setError(null);
    setShowForm(true);
  }

  function openEdit(t: PolicyTemplate) {
    setEditingId(t.id);
    setForm({ classOfBusiness: t.class_of_business ?? "", title: t.title, preamble: t.preamble ?? "", operativeClause: t.operative_clause ?? "", footerNote: t.footer_note ?? "" });
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || (!editingId && !form.classOfBusiness)) {
      setError("Choose a class of business and give the template a title.");
      return;
    }
    saveMutation.mutate(form);
  }

  const textField = (key: "preamble" | "operativeClause" | "footerNote", label: string, rows: number) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <textarea className="form-control" rows={rows} value={form[key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Placement</p>
          <h1>Policy Templates</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            The text printed around the schedule and wordings of the policy document issued when a slip is approved: title, preamble,
            operative clause and closing notice, per class of business. A class with no template uses the default. The clauses,
            warranties and exclusions themselves are managed in the Clause Library.
          </p>
        </div>
        <div className="page-header-actions">
          <RoleGate need="write">
            <button type="button" className="btn" onClick={openCreate}>+ New Template</button>
          </RoleGate>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 className="card-title">{editingId ? "Edit Template" : "New Template"}</h3>
          {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Class of Business</label>
                {editingId ? (
                  <input className="form-control" value={form.classOfBusiness ?? ""} disabled />
                ) : (
                  <select className="form-control" value={form.classOfBusiness ?? ""} onChange={(e) => setForm((f) => ({ ...f, classOfBusiness: e.target.value }))}>
                    <option value="">— Choose a class —</option>
                    {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Document title</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Private Motor Policy" />
              </div>
            </div>
            {textField("preamble", "Preamble", 4)}
            {textField("operativeClause", "Operative clause", 4)}
            {textField("footerNote", "Closing notice", 3)}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save Template"}</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>Class of business</th><th>Title</th><th>Version</th><th>Last edited by</th><th /></tr>
          </thead>
          <tbody>
            {fallback && (
              <tr>
                <td><em>All other classes (default)</em></td>
                <td>{fallback.title}</td>
                <td>built in</td>
                <td />
                <td />
              </tr>
            )}
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.class_of_business}</td>
                <td>{t.title}</td>
                <td>v{t.version}</td>
                <td>{t.updated_by || "—"}</td>
                <td>
                  <RoleGate need="write">
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(t)}>Edit</button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={retireMutation.isPending}
                        onClick={async () => {
                          if (await confirmDialog(`Retire the template for ${t.class_of_business}? That class will use the default.`)) retireMutation.mutate(t.id as number);
                        }}
                      >
                        Retire
                      </button>
                    </div>
                  </RoleGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
