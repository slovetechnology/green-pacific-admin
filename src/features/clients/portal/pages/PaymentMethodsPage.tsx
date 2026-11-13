import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { dateTime, type PaymentMethod } from "../api";

// How customers can pay in the portal. Bank transfer is built; online gateways (Paystack...) are listed here once
// their integration exists. Everyone on staff can see the methods; only admins change them.
function MethodCard({ method, canEdit }: { method: PaymentMethod; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: method.name,
    instructions: method.instructions ?? "",
    bank_name: method.details.bank_name ?? "",
    account_name: method.details.account_name ?? "",
    account_number: method.details.account_number ?? "",
    enabled: method.enabled,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const bank = method.kind === "bank_transfer";

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.put(`/api/payment-methods/${method.code}`, {
        name: form.name, instructions: form.instructions, enabled: form.enabled,
        ...(bank ? { details: { bank_name: form.bank_name, account_name: form.account_name, account_number: form.account_number } } : {}),
      });
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: "0.5rem" }}>
        <h2>{method.name}</h2>
        <StatusBadge status={method.enabled ? "Offered" : "Off"} />
      </div>
      {!bank && <p className="page-lede">Online payment ({method.code}) is not built yet, so it can't be offered.</p>}
      {error && <div className="flash flash-error">{error}</div>}
      {saved && <div className="flash flash-success">Saved.</div>}
      <form onSubmit={save}>
        <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${method.code}_name`}>Name customers see</label>
              <input id={`${method.code}_name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {bank && (
              <>
                <div className="field">
                  <label htmlFor={`${method.code}_bank`}>Bank</label>
                  <input id={`${method.code}_bank`} value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Zenith Bank" />
                </div>
                <div className="field">
                  <label htmlFor={`${method.code}_acname`}>Account name</label>
                  <input id={`${method.code}_acname`} value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`${method.code}_acno`}>Account number (NUBAN)</label>
                  <input id={`${method.code}_acno`} inputMode="numeric" maxLength={10} value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
                </div>
              </>
            )}
            <div className="field span-2">
              <label htmlFor={`${method.code}_instr`}>Instructions shown to the customer</label>
              <textarea id={`${method.code}_instr`} rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </div>
            <div className="field span-2">
              <label className="checkbox">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Offer this method to customers
              </label>
            </div>
          </div>
          {canEdit && (
            <div className="form-actions">
              <button type="submit" className="btn">{busy ? "Saving…" : "Save"}</button>
            </div>
          )}
        </fieldset>
      </form>
      {method.updated_at && <p className="page-lede">Last changed by {method.updated_by} on {dateTime(method.updated_at)}.</p>}
    </div>
  );
}

export function PaymentMethodsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["payment-methods"], queryFn: () => api.get<{ data: PaymentMethod[] }>("/api/payment-methods") });
  if (isLoading) return <p>Loading…</p>;
  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer portal</p>
          <h1>Payment Methods</h1>
          <p className="page-lede">How customers pay for their quotes in the portal. {user?.isAdmin ? "" : "Only an admin can change these."}</p>
        </div>
      </div>
      {(data?.data ?? []).map((m) => <MethodCard key={m.code} method={m} canEdit={!!user?.isAdmin} />)}
    </div>
  );
}
