import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { confirmAction } from "@/shared/components/ConfirmDialog";

interface Row {
  id: number;
  industry_naics: string;
  industry_label: string | null;
  expected_class_of_business: string;
  priority: string;
}

export function CoverageMatrixPage() {
  const queryClient = useQueryClient();
  const [naics, setNaics] = useState("");
  const [label, setLabel] = useState("");
  const [cls, setCls] = useState("");
  const [priority, setPriority] = useState("Recommended");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "coverage-matrix"],
    queryFn: () => api.get<{ rows: Row[]; priorities: string[] }>("/api/crm/coverage-matrix"),
  });

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/crm/coverage-matrix", { industry_naics: naics, industry_label: label, expected_class_of_business: cls, priority });
      setNaics("");
      setLabel("");
      setCls("");
      await queryClient.invalidateQueries({ queryKey: ["crm", "coverage-matrix"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(rowId: number) {
    if (!confirmAction("Remove this rule?")) return;
    await api.delete(`/api/crm/coverage-matrix/${rowId}`);
    await queryClient.invalidateQueries({ queryKey: ["crm", "coverage-matrix"] });
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "code", header: "Industry Code", render: (r) => r.industry_naics },
    { key: "label", header: "Label", render: (r) => r.industry_label || "—" },
    { key: "class", header: "Expected Class", render: (r) => r.expected_class_of_business },
    { key: "priority", header: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <RoleGate need="write">
          <button type="button" className="btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Marketing Operations</p>
          <h1>Coverage Matrix</h1>
          <p className="page-lede">Reference data: which classes of business are expected for each industry code. Drives the Coverage Gaps report.</p>
        </div>
        <Link className="btn-secondary btn" to="/crm/coverage-gaps">View coverage gaps</Link>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.rows}
        isLoading={isLoading}
        getRowKey={(r) => r.id}
        emptyMessage="No coverage rules defined yet."
      />

      <RoleGate need="write">
        <div className="card">
          <h2>Add Rule</h2>
          {error && <div className="flash flash-error">{error}</div>}
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="industry_naics">Industry code prefix</label>
                <input id="industry_naics" required placeholder="e.g. 484" value={naics} onChange={(e) => setNaics(e.target.value)} />
              </div>
              <div className="field span-2">
                <label htmlFor="industry_label">Label</label>
                <input id="industry_label" placeholder="e.g. Trucking &amp; Logistics" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="field span-2">
                <label htmlFor="expected_class_of_business">Expected class of business</label>
                <input id="expected_class_of_business" required value={cls} onChange={(e) => setCls(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="priority">Priority</label>
                <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {(data?.priorities || ["Essential", "Recommended", "Optional"]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>Add rule</button>
            </div>
          </form>
        </div>
      </RoleGate>
    </div>
  );
}
