import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import type { CurrencyRow } from "../api";

const QUERY_KEY = ["billing-currencies"];
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
const today = () => new Date().toISOString().slice(0, 10);

// The currencies customers can be billed in, chosen at sign-up. Insurer prices are naira: a customer billed in
// another currency sees each quote (insurer's premium plus the markup) converted at the rate in force when it is
// priced, and can pay into an account in that currency or into a naira account. The policy is always booked, and the
// insurer paid, in naira. Rates are the firm's one rate table (also used by the Ledger and Reinsurance).
// Everyone on staff can see this page; only admins change it.
export function BillingCurrenciesPage() {
  const { user } = useAuth();
  const canEdit = !!user?.isAdmin;
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: QUERY_KEY, queryFn: () => api.get<{ data: CurrencyRow[] }>("/api/customer-portal-billing-currencies") });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState({ currency: "", rate_date: today(), rate: "" });
  const [adding, setAdding] = useState(false);
  const [newCurrency, setNewCurrency] = useState({ code: "", name: "", decimals: "2" });

  if (isError) return <div className="flash flash-error">The currencies could not be loaded. Please refresh the page.</div>;
  if (isLoading || !data) return <p>Loading…</p>;
  const rows = data.data;
  const billing = rows.filter((c) => c.billing);
  const rateable = rows.filter((c) => !c.base && c.active);

  async function run(fn: () => Promise<string>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      setNotice(await fn());
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (c: CurrencyRow) =>
    run(async () => {
      const codes = billing.map((b) => b.code).filter((code) => code !== c.code);
      if (!c.billing) codes.push(c.code);
      await api.put("/api/customer-portal-billing-currencies", { codes });
      return c.billing
        ? `${c.code} is no longer offered at sign-up. Customers already billed in ${c.code} keep it.`
        : `${c.code} is now a billing currency${c.rate ? "" : ". Enter a rate before it is offered at sign-up"}.`;
    });

  const saveRate = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await api.post("/api/customer-portal-billing-currencies/rates", rate);
      setRate({ ...rate, rate: "" });
      return `${rate.currency} rate saved. It applies to quotes priced from now on.`;
    });
  };

  const saveCurrency = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await api.post("/api/customer-portal-billing-currencies/currencies", { ...newCurrency, decimals: Number(newCurrency.decimals) });
      setAdding(false);
      setNewCurrency({ code: "", name: "", decimals: "2" });
      return `${newCurrency.code.toUpperCase()} added. Switch it on and enter a rate to bill customers in it.`;
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer portal</p>
          <h1>Billing Currencies</h1>
          <p className="page-lede">
            The currencies customers can choose to be billed in when they sign up. Insurer prices are in naira: for a customer billed in another currency, each quote
            (the insurer&apos;s premium plus the <Link to="/portal/pricing-markup">markup</Link>) is converted at the latest rate when it is priced, and the quote keeps that price.
            The policy is always booked, and the insurer paid, in naira. Customers pay into an account in their currency or a naira account (see{" "}
            <Link to="/portal/payment-methods">Payment Methods</Link>). {canEdit ? "" : "Only an admin can change these."}
          </p>
        </div>
        {canEdit && !adding && (
          <div className="page-header-actions">
            <button type="button" className="btn-secondary btn" onClick={() => setAdding(true)}>+ Add a currency</button>
          </div>
        )}
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {notice && <div className="flash flash-success">{notice}</div>}

      {adding && (
        <div className="card">
          <h2>New currency</h2>
          <form onSubmit={saveCurrency}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="cur_code">Code</label>
                  <input id="cur_code" required maxLength={3} value={newCurrency.code} onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })} placeholder="e.g. CAD" />
                </div>
                <div className="field">
                  <label htmlFor="cur_name">Name</label>
                  <input id="cur_name" required value={newCurrency.name} onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })} placeholder="e.g. Canadian Dollar" />
                </div>
                <div className="field">
                  <label htmlFor="cur_dec">Decimals</label>
                  <select id="cur_dec" value={newCurrency.decimals} onChange={(e) => setNewCurrency({ ...newCurrency, decimals: e.target.value })}>
                    {["0", "1", "2", "3"].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn">{busy ? "Saving…" : "Add currency"}</button>
                <button type="button" className="btn-secondary btn" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </fieldset>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Currencies</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Currency</th>
                <th>Billing</th>
                <th>Latest rate (₦ per unit)</th>
                <th>Rate date</th>
                {canEdit && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code}>
                  <td><strong>{c.code}</strong> {c.name}{!c.active && " (switched off)"}</td>
                  <td>
                    {c.base ? <StatusBadge status="Always" /> : c.billing ? <StatusBadge status={c.rate ? "Offered" : "Needs a rate"} /> : <StatusBadge status="Off" />}
                  </td>
                  <td>{c.base ? "—" : c.rate ? fmtMoney(c.rate.rate) : "No rate yet"}</td>
                  <td>
                    {c.rate ? c.rate.rate_date : "—"}
                    {c.rate?.stale && <> <span className="badge badge-part-paid">Stale</span></>}
                  </td>
                  {canEdit && (
                    <td>
                      {!c.base && c.active && (
                        <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => void toggle(c)}>
                          {c.billing ? "Stop offering" : "Offer for billing"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="page-lede" style={{ marginTop: "0.75rem" }}>
          A billing currency is offered at sign-up once it has a rate. Stopping one only affects new sign-ups: customers, quotes and accounts already in it keep working.
          A rate older than 5 days is marked stale; it is still used until a newer one is entered.
        </p>
      </div>

      {canEdit && rateable.length > 0 && (
        <div className="card">
          <h2>Enter a rate</h2>
          <form onSubmit={saveRate}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="rate_ccy">Currency</label>
                  <select id="rate_ccy" required value={rate.currency} onChange={(e) => setRate({ ...rate, currency: e.target.value })}>
                    <option value="">Choose…</option>
                    {rateable.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rate_date">Rate date</label>
                  <input id="rate_date" type="date" required max={today()} value={rate.rate_date} onChange={(e) => setRate({ ...rate, rate_date: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="rate_value">₦ per 1 {rate.currency || "unit"} (CBN official)</label>
                  <input id="rate_value" required inputMode="decimal" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} placeholder="e.g. 1500.25" />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn">{busy ? "Saving…" : "Save rate"}</button>
              </div>
            </fieldset>
          </form>
          <p className="page-lede">Rates go into the firm&apos;s rate table, so the Ledger and Reinsurance use them too. One rate per currency per date.</p>
        </div>
      )}
    </div>
  );
}
