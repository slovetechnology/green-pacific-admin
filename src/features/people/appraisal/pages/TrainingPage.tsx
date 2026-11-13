import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import type { AppraisalMeta } from "../lib/appraisalTypes";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface Requirement {
  id: number;
  title: string;
  category: string;
  due_date: string;
  applies_to: "all" | "client_facing";
  is_active: number;
  n_completed: number;
}

interface TrainingRecord {
  id: number;
  employee_id: number;
  full_name: string;
  staff_no: string;
  requirement_id: number | null;
  kind: "Training" | "Certification";
  title: string;
  category: string;
  completed_on: string;
  expires_on: string | null;
  evidence: string | null;
}

interface TrainingData {
  categories: string[];
  requirements: Requirement[];
  records: TrainingRecord[];
  canManage: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

// Mandatory training and professional certifications. HR sets requirements
// and records completions; everyone else sees their own records. Late
// mandatory training suggests a Minor conduct flag; both feed HR KPIs.
export function TrainingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["appraisal", "training"], queryFn: () => api.get<TrainingData>("/api/appraisal/training") });
  const search = useRowSearch(data?.records, (r) => [r.full_name, r.staff_no, r.title, r.category, r.evidence]);
  const canManage = Boolean(data?.canManage);
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta"), enabled: canManage });
  const [req, setReq] = useState({ title: "", category: "", due_date: "", applies_to: "all" });
  const [rec, setRec] = useState({ employee_id: "", requirement_id: "", kind: "Training", title: "", category: "", completed_on: today(), expires_on: "", evidence: "" });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(e: FormEvent, path: string, body: object, done: () => void, text: string) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post(path, body);
      done();
      setMessage({ kind: "success", text });
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "training"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not save." });
    }
  }

  if (isLoading || !data) return <div className="card">Loading…</div>;
  const expired = (r: TrainingRecord) => r.expires_on && r.expires_on < today();

  return (
    <div>
      <div className="page-header">
        <h1>{canManage ? "Training & certification" : "My training & certification"}</h1>
      </div>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      {canManage && (
        <div className="card">
          <h2>Mandatory training</h2>
          <DataGrid
            columns={[
              { key: "t", header: "Training", render: (r) => r.title },
              { key: "c", header: "Category", render: (r) => r.category },
              { key: "d", header: "Due", render: (r) => r.due_date },
              { key: "a", header: "For", render: (r) => (r.applies_to === "all" ? "Everyone" : "Client-facing staff") },
              { key: "n", header: "Completed", align: "right", render: (r) => r.n_completed },
              { key: "s", header: "", render: (r) => (r.is_active ? null : <span className="badge badge-closed">Inactive</span>) },
            ]}
            rows={data.requirements}
            isLoading={false}
            getRowKey={(r) => r.id}
            emptyMessage="No mandatory training set yet."
          />
          <form onSubmit={(e) => submit(e, "/api/appraisal/training/requirements", req, () => setReq({ title: "", category: "", due_date: "", applies_to: "all" }), "Requirement added.")}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="req-title">Training</label>
                <input id="req-title" value={req.title} onChange={(e) => setReq({ ...req, title: e.target.value })} placeholder="AML/CFT refresher 2026" required />
              </div>
              <div className="field">
                <label htmlFor="req-cat">Category</label>
                <select id="req-cat" value={req.category} onChange={(e) => setReq({ ...req, category: e.target.value })} required>
                  <option value="">Choose…</option>
                  {data.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="req-due">Due</label>
                <input id="req-due" type="date" value={req.due_date} onChange={(e) => setReq({ ...req, due_date: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="req-for">For</label>
                <select id="req-for" value={req.applies_to} onChange={(e) => setReq({ ...req, applies_to: e.target.value })}>
                  <option value="all">Everyone</option>
                  <option value="client_facing">Client-facing staff</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn">Add requirement</button>
            </div>
          </form>
        </div>
      )}

      {canManage && (
        <div className="card">
          <h2>Record a completion or certification</h2>
          <form
            onSubmit={(e) =>
              submit(e, "/api/appraisal/training/records", rec, () => setRec({ ...rec, employee_id: "", title: "", evidence: "", expires_on: "" }), "Recorded.")
            }
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor="rec-emp">Employee</label>
                <select id="rec-emp" value={rec.employee_id} onChange={(e) => setRec({ ...rec, employee_id: e.target.value })} required>
                  <option value="">Choose…</option>
                  {meta.data?.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.staff_no})</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="rec-kind">Type</label>
                <select id="rec-kind" value={rec.kind} onChange={(e) => setRec({ ...rec, kind: e.target.value, requirement_id: "" })}>
                  <option value="Training">Training</option>
                  <option value="Certification">Certification</option>
                </select>
              </div>
              {rec.kind === "Training" && (
                <div className="field">
                  <label htmlFor="rec-req">Mandatory training (if any)</label>
                  <select id="rec-req" value={rec.requirement_id} onChange={(e) => setRec({ ...rec, requirement_id: e.target.value })}>
                    <option value="">None</option>
                    {data.requirements.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                </div>
              )}
              {!rec.requirement_id && (
                <>
                  <div className="field">
                    <label htmlFor="rec-title">Title</label>
                    <input id="rec-title" value={rec.title} onChange={(e) => setRec({ ...rec, title: e.target.value })} placeholder={rec.kind === "Certification" ? "ACIIN" : ""} />
                  </div>
                  <div className="field">
                    <label htmlFor="rec-cat">Category</label>
                    <select id="rec-cat" value={rec.category} onChange={(e) => setRec({ ...rec, category: e.target.value })}>
                      <option value="">Choose…</option>
                      {data.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="rec-done">Completed on</label>
                <input id="rec-done" type="date" value={rec.completed_on} onChange={(e) => setRec({ ...rec, completed_on: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="rec-exp">Expires</label>
                <input id="rec-exp" type="date" value={rec.expires_on} onChange={(e) => setRec({ ...rec, expires_on: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="rec-evidence">Evidence</label>
                <input id="rec-evidence" value={rec.evidence} onChange={(e) => setRec({ ...rec, evidence: e.target.value })} placeholder="Certificate number, LMS report" />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn">Record</button>
            </div>
          </form>
        </div>
      )}

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Person, staff no., course or category…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={[
          ...(canManage ? [{ key: "emp", header: "Employee", render: (r: TrainingRecord) => r.full_name }] : []),
          { key: "title", header: "Training / certification", render: (r) => r.title },
          { key: "kind", header: "Type", render: (r) => r.kind },
          { key: "cat", header: "Category", render: (r) => r.category },
          { key: "done", header: "Completed", render: (r) => r.completed_on },
          { key: "exp", header: "Expires", render: (r) => (r.expires_on ? <>{r.expires_on} {expired(r) && <span className="badge badge-overdue">Expired</span>}</> : "—") },
        ]}
        rows={search.filtered}
        isLoading={false}
        getRowKey={(r) => r.id}
        emptyMessage="No training records yet."
      />
    </div>
  );
}
