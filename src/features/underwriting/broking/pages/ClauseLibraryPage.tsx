import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { DataGrid } from "@/shared/components/DataGrid";
import {
  CLAUSE_TYPES,
  createClauseLibraryEntry,
  fetchClauseLibrary,
  fetchExternalSources,
  importExternalReference,
  refreshDraftSlipClauses,
  retireClauseLibraryEntry,
  updateClauseLibraryEntry,
  type ClauseLibraryEntry,
  type ClauseLibraryPayload,
} from "../api/clauseLibrary";

const EMPTY_FORM: ClauseLibraryPayload = {
  code: "",
  title: "",
  clauseType: "Clause",
  wording: "",
  description: "",
  classOfBusiness: "",
  isMandatory: false,
  priority: 0,
  status: "Active",
};

interface FormOptions {
  classes: string[];
}

export function ClauseLibraryPage() {
  const queryClient = useQueryClient();
  const [clauseType, setClauseType] = useState("");
  const [classOfBusiness, setClassOfBusiness] = useState("");
  const [status, setStatus] = useState("Active");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ClauseLibraryPayload>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importClass, setImportClass] = useState("");

  const sourcesQuery = useQuery({ queryKey: ["clauseLibrary", "externalSources"], queryFn: fetchExternalSources });

  const importMutation = useMutation({
    mutationFn: () => importExternalReference(importUrl.trim(), importClass || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clauseLibrary"] });
      setImportUrl("");
      setStatus("Draft");
    },
  });

  const optionsQuery = useQuery({
    queryKey: ["transactions", "meta"],
    queryFn: () => api.get<FormOptions>("/api/transactions/meta/form-options"),
  });

  const listQuery = useQuery({
    queryKey: ["clauseLibrary", clauseType, classOfBusiness, status, search],
    queryFn: () => fetchClauseLibrary({ clauseType, classOfBusiness, status, search }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ClauseLibraryPayload) =>
      editingId ? updateClauseLibraryEntry(editingId, payload) : createClauseLibraryEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clauseLibrary"] });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: (err: Error) => setError(err.message || "Failed to save clause"),
  });

  const retireMutation = useMutation({
    mutationFn: (id: number) => retireClauseLibraryEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clauseLibrary"] }),
  });

  const refreshMutation = useMutation({
    mutationFn: (apply: boolean) => refreshDraftSlipClauses(apply),
    onSuccess: (result) => {
      if (result.applied) queryClient.invalidateQueries({ queryKey: ["brokingSlip"] });
    },
  });
  const refresh = refreshMutation.data;

  const classes = useMemo(() => optionsQuery.data?.classes || [], [optionsQuery.data]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(entry: ClauseLibraryEntry) {
    setEditingId(entry.id);
    setForm({
      code: entry.code,
      title: entry.title,
      clauseType: entry.clause_type,
      wording: entry.wording,
      description: entry.description || "",
      classOfBusiness: entry.class_of_business || "",
      product: entry.product || "",
      riskType: entry.risk_type || "",
      coverage: entry.coverage || "",
      insurerId: entry.insurer_id ?? undefined,
      jurisdiction: entry.jurisdiction || "",
      policyVersion: entry.policy_version || "",
      priority: entry.priority ?? 0,
      isMandatory: Boolean(entry.isMandatory),
      status: (entry.status as "Active" | "Retired" | "Draft") || "Active",
    });
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim() || !form.wording.trim()) {
      setError("Code, title and wording are required.");
      return;
    }
    saveMutation.mutate(form);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Placement</p>
          <h1>Clause Library</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Manage extensions, exclusions, conditions and endorsements resolved onto broking slips by class of
            business, product, risk type and coverage.
          </p>
        </div>
        <div className="page-header-actions">
          <RoleGate need="write">
            <button type="button" className="btn" onClick={openCreate}>
              + New Clause
            </button>
          </RoleGate>
        </div>
      </div>

      <RoleGate need="admin">
        <div className="card">
          <h2>Refresh clauses on Draft slips</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Re-picks the clauses on every Draft broking slip from the current library, so each slip carries only what applies to
            its class of business. Approved and placed slips are not touched, and clauses you edited on a slip's Placement View
            are kept. Preview first.
          </p>
          {refreshMutation.isError && <div className="flash flash-error">{(refreshMutation.error as Error).message}</div>}
          {refresh && (
            <div className={refresh.applied ? "flash flash-success" : "flash"}>
              {refresh.applied ? "Done. " : "Preview: "}
              {refresh.totalDrafts} Draft slip(s) checked; {refresh.changedSlips} {refresh.applied ? "refreshed" : "would change"} (
              {refresh.removedClauses} clauses removed, {refresh.addedClauses} added).
              {refresh.changes.length > 0 && (
                <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem", maxHeight: "12rem", overflow: "auto" }}>
                  {refresh.changes.map((c) => (
                    <li key={c.slipId}>
                      {c.slipNumber} ({c.classOfBusiness || "no class"}): −{c.removed} +{c.added}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate(false)}>
              Preview
            </button>
            <button
              type="button"
              className="btn"
              disabled={refreshMutation.isPending || !refresh || refresh.applied || refresh.changedSlips === 0}
              onClick={() => {
                if (window.confirm(`Rewrite the clauses on ${refresh?.changedSlips} Draft slip(s)?`)) refreshMutation.mutate(true);
              }}
            >
              Apply to {refresh && !refresh.applied ? refresh.changedSlips : 0} slip(s)
            </button>
          </div>
        </div>
      </RoleGate>

      <RoleGate need="write">
        <div className="card">
          <h2>Import a reference page</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            For a class with no wordings on file, pull a page from an approved website in as a <strong>Draft</strong> reference.
            Drafts never appear on a policy. Read the page, rewrite it as proper policy wording, then edit the entry and set it
            to Active. These sites describe classes of insurance; they do not publish policy wordings, so expect to rewrite.
            Approved sites: {sourcesQuery.data?.join(", ") || "loading…"}.
          </p>
          {importMutation.isError && <div className="flash flash-error">{(importMutation.error as Error).message}</div>}
          {importMutation.isSuccess && (
            <div className="flash flash-success">
              {importMutation.data.created ? "Imported as a Draft" : "Already imported"}: {importMutation.data.entry.title}
            </div>
          )}
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <input
              type="url"
              placeholder="https://…"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              style={{ minWidth: "22rem" }}
            />
            <select value={importClass} onChange={(e) => setImportClass(e.target.value)}>
              <option value="">Any class</option>
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button type="button" className="btn" disabled={importMutation.isPending || !importUrl.trim()} onClick={() => importMutation.mutate()}>
              {importMutation.isPending ? "Importing…" : "Import as Draft"}
            </button>
          </div>
        </div>
      </RoleGate>

      <div className="toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input
            type="search"
            placeholder="Search code, title, wording…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn-secondary btn">Search</button>
        </form>
        <select value={clauseType} onChange={(e) => setClauseType(e.target.value)}>
          <option value="">All clause types</option>
          {CLAUSE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={classOfBusiness} onChange={(e) => setClassOfBusiness(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="Active">Active</option>
          <option value="Draft">Draft</option>
          <option value="Retired">Retired</option>
          <option value="">All statuses</option>
        </select>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 className="card-title">{editingId ? "Edit Clause" : "New Clause"}</h3>
          {error && <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Code</label>
                <input
                  className="form-control"
                  value={form.code}
                  disabled={Boolean(editingId)}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. FSP-010"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-control"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Clause Type</label>
                <select
                  className="form-control"
                  value={form.clauseType}
                  onChange={(e) => setForm((f) => ({ ...f, clauseType: e.target.value as ClauseLibraryPayload["clauseType"] }))}
                >
                  {CLAUSE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class of Business</label>
                <select
                  className="form-control"
                  value={form.classOfBusiness || ""}
                  onChange={(e) => setForm((f) => ({ ...f, classOfBusiness: e.target.value }))}
                >
                  <option value="">— Applies to all classes —</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Priority (tie-break ordering)</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.priority ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="form-group" style={{ alignSelf: "end" }}>
                <label className="form-label">
                  <input
                    type="checkbox"
                    checked={Boolean(form.isMandatory)}
                    onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
                    style={{ marginRight: "0.4rem" }}
                  />
                  Mandatory clause
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-control"
                value={form.status ?? "Active"}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ClauseLibraryPayload["status"] }))}
              >
                <option value="Active">Active (printed on policies)</option>
                <option value="Draft">Draft (reference only)</option>
                <option value="Retired">Retired</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Wording</label>
              <textarea
                className="form-control"
                rows={4}
                value={form.wording}
                onChange={(e) => setForm((f) => ({ ...f, wording: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description (internal notes, optional)</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.description || ""}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save Clause"}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <DataGrid<ClauseLibraryEntry>
        columns={[
          { key: "code", header: "Code", render: (entry) => entry.code },
          { key: "title", header: "Title", render: (entry) => entry.title },
          { key: "type", header: "Type", render: (entry) => entry.clause_type },
          { key: "class", header: "Class", render: (entry) => entry.class_of_business || "All classes" },
          { key: "mandatory", header: "Mandatory", render: (entry) => (entry.isMandatory ? "Yes" : "") },
          { key: "source", header: "Source", render: (entry) => (entry.source === "External" ? "External reference" : "Local") },
          { key: "status", header: "Status", render: (entry) => entry.status },
          {
            key: "actions",
            header: "",
            render: (entry) => (
              <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                <RoleGate need="write">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(entry)}>
                    Edit
                  </button>
                  {entry.status !== "Retired" && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => retireMutation.mutate(entry.id)}
                      disabled={retireMutation.isPending}
                    >
                      Retire
                    </button>
                  )}
                </RoleGate>
              </div>
            ),
          },
        ]}
        rows={listQuery.data}
        isLoading={listQuery.isLoading}
        getRowKey={(entry) => entry.id}
        emptyMessage="No clauses found."
      />
    </div>
  );
}
