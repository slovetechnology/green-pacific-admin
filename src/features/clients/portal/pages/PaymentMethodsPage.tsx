import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { confirmDialog } from "@/shared/components/Dialogs";
import { dateTime, type PaymentMethod } from "../api";

const DEFAULT_INSTRUCTIONS =
  "Transfer the exact amount to the account below, using the payment reference as the narration, then upload your payment receipt or a screenshot.";
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

// How customers can pay in the portal: one or more bank accounts (each its own method, shown to customers in the
// order here), and later online gateways (Paystack...) once their integration exists. Everyone on staff can see the
// methods; only admins add, change, order or delete them.

/** One method's form. With no `method` it adds a new bank account. */
function MethodCard({
  method,
  canEdit,
  position,
  onMove,
  onDeleted,
  onCreated,
  onCancel,
  moving = false,
  lastOffered = false,
}: {
  method?: PaymentMethod;
  canEdit: boolean;
  /** Another card is being moved: moving this one too would race it. */
  moving?: boolean;
  /** The only method customers can pay with: deleting it leaves them no way to pay. */
  lastOffered?: boolean;
  position?: { index: number; count: number };
  onMove?: (by: -1 | 1) => Promise<void>;
  onDeleted?: (name: string) => void;
  onCreated?: (name: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const creating = !method;
  const [form, setForm] = useState({
    name: method?.name ?? "",
    instructions: method ? (method.instructions ?? "") : DEFAULT_INSTRUCTIONS,
    bank_name: method?.details.bank_name ?? "",
    account_name: method?.details.account_name ?? "",
    account_number: method?.details.account_number ?? "",
    enabled: method?.enabled ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const bank = creating || method.kind === "bank_transfer";
  const key = method?.code ?? "new";

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const body = {
      name: form.name, instructions: form.instructions, enabled: form.enabled,
      ...(bank ? { details: { bank_name: form.bank_name, account_name: form.account_name, account_number: form.account_number } } : {}),
    };
    try {
      if (creating) {
        const res = await api.post<{ data: PaymentMethod }>("/api/payment-methods", { kind: "bank_transfer", ...body });
        await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
        onCreated?.(res.data.name);
        return;
      }
      await api.put(`/api/payment-methods/${method.code}`, body);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!method) return;
    const ok = await confirmDialog({
      title: `Delete ${method.name}?`,
      message: `${lastOffered ? "This is the only way customers can pay: until another method is offered, they won't be able to pay for their quotes. " : "Customers will no longer be able to choose it. "}Payments already started with it keep its account details.${method.enabled ? " To stop offering it for now, switch it off instead." : ""}`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      await api.delete(`/api/payment-methods/${method.code}`);
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      onDeleted?.(method.name);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function move(by: -1 | 1) {
    setError(null);
    setBusy(true);
    try {
      await onMove?.(by);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: "0.5rem" }}>
        <div>
          <h2>{creating ? "New bank account" : method.name}</h2>
          {position && position.count > 1 && <p className="page-lede" style={{ margin: 0 }}>Shown to customers {ordinal(position.index + 1)} of {position.count}</p>}
        </div>
        <div className="page-header-actions">
          {!creating && <StatusBadge status={method.enabled ? "Offered" : "Off"} />}
          {canEdit && !creating && position && position.count > 1 && (
            <>
              <button type="button" className="btn-secondary btn btn-sm" disabled={busy || moving || position.index === 0} onClick={() => void move(-1)} aria-label={`Move ${method.name} up`}>
                ↑ Up
              </button>
              <button type="button" className="btn-secondary btn btn-sm" disabled={busy || moving || position.index === position.count - 1} onClick={() => void move(1)} aria-label={`Move ${method.name} down`}>
                ↓ Down
              </button>
            </>
          )}
          {canEdit && !creating && (
            <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
      </div>
      {!bank && <p className="page-lede">Online payment ({method?.code}) is not built yet, so it can't be offered.</p>}
      {error && <div className="flash flash-error">{error}</div>}
      {saved && <div className="flash flash-success">Saved.</div>}
      <form onSubmit={save}>
        <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${key}_name`}>Name customers see</label>
              <input
                id={`${key}_name`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={creating ? `Bank transfer${form.bank_name ? ` (${form.bank_name})` : ""}` : undefined}
              />
            </div>
            {bank && (
              <>
                <div className="field">
                  <label htmlFor={`${key}_bank`}>Bank</label>
                  <input id={`${key}_bank`} value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Zenith Bank" />
                </div>
                <div className="field">
                  <label htmlFor={`${key}_acname`}>Account name</label>
                  <input id={`${key}_acname`} value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`${key}_acno`}>Account number (NUBAN)</label>
                  <input id={`${key}_acno`} inputMode="numeric" maxLength={10} value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
                </div>
              </>
            )}
            <div className="field span-2">
              <label htmlFor={`${key}_instr`}>Instructions shown to the customer</label>
              <textarea id={`${key}_instr`} rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </div>
            <div className="field span-2">
              <label className="checkbox">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Offer this method to customers
              </label>
            </div>
          </div>
          {canEdit && (
            <div className="form-actions">
              <button type="submit" className="btn">{busy ? "Saving…" : creating ? "Add bank account" : "Save"}</button>
              {creating && (
                <button type="button" className="btn-secondary btn" onClick={onCancel}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </fieldset>
      </form>
      {method?.updated_at && <p className="page-lede">Last changed by {method.updated_by} on {dateTime(method.updated_at)}.</p>}
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function PaymentMethodsPage() {
  const { user } = useAuth();
  const canEdit = !!user?.isAdmin;
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["payment-methods"], queryFn: () => api.get<{ data: PaymentMethod[] }>("/api/payment-methods") });
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (isError) return <div className="flash flash-error">The payment methods could not be loaded. Please refresh the page.</div>;
  if (isLoading) return <p>Loading…</p>;
  const methods = data?.data ?? [];
  const offered = methods.filter((m) => m.enabled).length;

  async function move(index: number, by: -1 | 1) {
    const codes = methods.map((m) => m.code);
    const to = index + by;
    [codes[index], codes[to]] = [codes[to], codes[index]];
    setMoving(true);
    try {
      await api.put("/api/payment-methods/order", { codes });
    } finally {
      // Reloaded either way: if someone else added or deleted a method meanwhile, the order was refused and the
      // page needs the current list.
      await queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      setMoving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer portal</p>
          <h1>Payment Methods</h1>
          <p className="page-lede">
            How customers pay for their quotes in the portal. {offered === 0 ? "None is offered yet, so customers can't pay." : `${offered} offered to customers, shown to them in this order; they choose one when paying.`}{" "}
            {canEdit ? "" : "Only an admin can change these."}
          </p>
        </div>
        {canEdit && !adding && (
          <div className="page-header-actions">
            <button type="button" className="btn" onClick={() => { setNotice(null); setAdding(true); }}>
              + Add a bank account
            </button>
          </div>
        )}
      </div>

      {notice && <div className="flash flash-success">{notice}</div>}
      {adding && (
        <MethodCard
          canEdit={canEdit}
          onCancel={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice(`${name} added. It is shown last; move it up to show it earlier.`);
          }}
        />
      )}
      {methods.length === 0 && !adding && <p className="empty-state">No payment methods yet. Add a bank account customers can pay into.</p>}
      {methods.map((m, i) => (
        <MethodCard
          key={m.code}
          method={m}
          canEdit={canEdit}
          position={{ index: i, count: methods.length }}
          onMove={(by) => move(i, by)}
          moving={moving}
          lastOffered={m.enabled && offered === 1}
          onDeleted={(name) => setNotice(`${name} deleted.`)}
        />
      ))}
    </div>
  );
}
