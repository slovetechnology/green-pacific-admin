import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { confirmAction } from "@/shared/components/ConfirmDialog";
import { ChartOfAccountsTree, type CoaAccount } from "@/features/finance/accounting/components/ChartOfAccountsTree";

type Account = CoaAccount;

interface AccountsResponse {
  accounts: Account[];
  accountTypes: string[];
  classifications: string[];
}

const EMPTY_FORM = { code: "", name: "", account_type: "Asset", classification: "Operating", parent_id: "", is_selectable: true, description: "" };

export function ChartOfAccountsPage() {
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [view, setView] = useState<"tree" | "table">("tree");
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["chart-of-accounts", includeInactive],
    queryFn: () => api.get<AccountsResponse>(`/api/chart-of-accounts?includeInactive=${includeInactive}`),
  });

  function startEdit(account: Account) {
    setEditingId(account.id);
    setForm({
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      classification: account.classification,
      parent_id: account.parent_id == null ? "" : String(account.parent_id),
      is_selectable: Boolean(account.is_selectable),
      description: account.description || "",
    });
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function chooseParent(parentId: string) {
    const parent = data?.accounts.find((a) => String(a.id) === parentId);
    setForm((f) => ({
      ...f,
      parent_id: parentId,
      account_type: parent ? parent.account_type : f.account_type,
      // A top-level header has no classification of its own, so only inherit from deeper parents.
      classification: parent && parent.parent_id != null ? parent.classification : f.classification,
    }));
  }

  async function loadStandardChart() {
    if (!confirmAction("Load the standard insurance-broker chart of accounts? Existing account codes are left unchanged.")) return;
    setError(null);
    try {
      const result = await api.post<{ createdCount: number; existingCount: number; warnings: string[] }>("/api/chart-of-accounts/seed", {});
      setNotice(`Added ${result.createdCount} accounts; ${result.existingCount} were already present. ${result.warnings.join(" ")}`.trim());
      await queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the standard chart.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (editingId === null) {
        await api.post("/api/chart-of-accounts", form);
      } else {
        await api.put(`/api/chart-of-accounts/${editingId}`, form);
      }
      await queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveAccount(account: Account) {
    if (!confirmAction(`Archive account ${account.code} - ${account.name}?`)) return;
    try {
      await api.delete(`/api/chart-of-accounts/${account.id}`);
      await queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      if (editingId === account.id) resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not archive account.");
    }
  }

  const actions = (a: Account) => (
    <RoleGate need="write">
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(a)}>Edit</button>
        {a.is_active === 1 && <button type="button" className="btn-secondary btn-sm" onClick={() => archiveAccount(a)}>Archive</button>}
      </div>
    </RoleGate>
  );

  const columns: DataGridColumn<Account>[] = [
    { key: "code", header: "Code", render: (a) => <strong>{a.code}</strong> },
    { key: "name", header: "Account name", render: (a) => a.name },
    { key: "type", header: "Type", render: (a) => a.account_type },
    {
      key: "classification",
      header: "Funds",
      render: (a) => (
        <span className={`coa-tag ${a.classification === "Fiduciary" ? "coa-tag-fiduciary" : "coa-tag-operating"}`}>
          {a.classification === "Fiduciary" ? "Fiduciary / Trust" : "Operational"}
        </span>
      ),
    },
    { key: "description", header: "Description", render: (a) => a.description || "—" },
    {
      key: "status",
      header: "Status",
      render: (a) => (a.is_active ? <span className="badge badge-paid">Active</span> : <span className="badge">Archived</span>),
    },
    { key: "actions", header: "", render: (a) => actions(a) },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Chart of Accounts</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Maintain the account codes used to classify company income, expenses, assets, liabilities, and equity.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show archived
          </label>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setView(view === "tree" ? "table" : "tree")}>
            {view === "tree" ? "Table view" : "Tree view"}
          </button>
          <RoleGate need="admin">
            <button type="button" className="btn-secondary btn-sm" onClick={loadStandardChart}>Load standard chart</button>
          </RoleGate>
        </div>
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {notice && <div className="flash flash-success">{notice}</div>}

      <RoleGate need="write">
        <div className="card">
          <h2>{editingId === null ? "Add account" : "Edit account"}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="account-code">Account code</label>
                <input id="account-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="account-name">Account name</label>
                <input id="account-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="account-type">Account type</label>
                <select id="account-type" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
                  {(data?.accountTypes || ["Asset", "Liability", "Equity", "Income", "Expense"]).map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="account-parent">Parent account</label>
                <select id="account-parent" value={form.parent_id} onChange={(e) => chooseParent(e.target.value)}>
                  <option value="">None (top level)</option>
                  {(data?.accounts || [])
                    .filter((a) => a.id !== editingId && !a.is_selectable && a.is_active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="account-classification">Funds</label>
                <select id="account-classification" value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
                  <option value="Operating">Operational (company funds)</option>
                  <option value="Fiduciary">Fiduciary / Trust (client money)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="account-selectable">
                  <input id="account-selectable" type="checkbox" checked={form.is_selectable} onChange={(e) => setForm({ ...form, is_selectable: e.target.checked })} />
                  {" "}Posting account (untick for a header that groups sub-accounts)
                </label>
              </div>
              <div className="field span-2">
                <label htmlFor="account-description">Description</label>
                <input id="account-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>{submitting ? "Saving…" : editingId === null ? "Add account" : "Save changes"}</button>
              {editingId !== null && <button type="button" className="btn-secondary btn" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </div>
      </RoleGate>

      {view === "tree" ? (
        isLoading ? <div className="loading-container">Loading...</div> : <ChartOfAccountsTree accounts={data?.accounts || []} renderActions={actions} />
      ) : (
        <DataGrid
          columns={columns}
          rows={data?.accounts}
          isLoading={isLoading}
          getRowKey={(a) => a.id}
          emptyMessage="No accounts have been created."
        />
      )}
    </div>
  );
}
