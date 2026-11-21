import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import { dateTime } from "../api";

interface MarkupSetting {
  enabled: boolean;
  type: "percent" | "fixed";
  value: number;
  is_default: boolean;
  updated_by: string | null;
  updated_at: string | null;
  default: { enabled: boolean; type: "percent" | "fixed"; value: number };
  example: { insurerPremium: number; markup: number; premium: number; rule: string | null };
}

// Green Pacific's markup on insurer prices for portal quotes. Everyone on staff can see it; only admins change it.
export function PricingMarkupPage() {
  const { user } = useAuth();
  const canEdit = !!user?.isAdmin;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["portal-markup"], queryFn: () => api.get<{ data: MarkupSetting }>("/api/customer-portal-markup") });
  const s = data?.data;
  const [form, setForm] = useState({ enabled: true, type: "percent" as "percent" | "fixed", value: "10" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filled from the saved setting when it loads or changes, not on every background refetch (which would wipe what
  // the admin is typing).
  const savedKey = s ? `${s.enabled}|${s.type}|${s.value}|${s.updated_at ?? ""}` : "";
  useEffect(() => {
    if (s) setForm({ enabled: s.enabled, type: s.type, value: String(s.value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    setBusy(true);
    try {
      const res = await api.put<{ message: string }>("/api/customer-portal-markup", { enabled: form.enabled, type: form.type, value: Number(form.value) });
      setSaved(res.message);
      await queryClient.invalidateQueries({ queryKey: ["portal-markup"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !s) return <p>Loading…</p>;
  // A live preview of the form as it stands, on a ₦100,000 insurer premium.
  const value = Number(form.value) || 0;
  const on = form.enabled && value > 0;
  const markup = on ? Math.round((form.type === "percent" ? (100_000 * value) / 100 : value) * 100) / 100 : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer portal</p>
          <h1>Pricing Markup</h1>
          <p className="page-lede">
            Green Pacific&apos;s markup on the prices insurers give for portal quotes, online or recorded by staff. The customer pays the insurer&apos;s premium plus the markup;
            only the insurer&apos;s premium is owed to the insurer, and the markup is receipted as Green Pacific&apos;s income (Policy Fees). {canEdit ? "" : "Only an admin can change it."}
          </p>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={s.enabled && s.value > 0 ? (s.example.rule ?? "On") : "Off"} />
        </div>
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {saved && <div className="flash flash-success">{saved}</div>}

      <div className="card">
        <h2>Markup</h2>
        {s.is_default && <p className="page-lede">Not set yet, so the default applies: {s.default.value}% on every insurer price.</p>}
        <form onSubmit={save}>
          <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <div className="field span-2">
                <label className="checkbox">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Add a markup to insurer prices
                </label>
              </div>
              <div className="field">
                <label htmlFor="mk_type">Markup is</label>
                <select id="mk_type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })}>
                  <option value="percent">A percentage of the insurer&apos;s premium</option>
                  <option value="fixed">A fixed amount per policy (₦)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="mk_value">{form.type === "percent" ? "Percentage (%)" : "Amount (₦)"}</label>
                <input id="mk_value" inputMode="decimal" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            {canEdit && (
              <div className="form-actions">
                <button type="submit" className="btn">{busy ? "Saving…" : "Save markup"}</button>
              </div>
            )}
          </fieldset>
        </form>
        {s.updated_at && !s.is_default && <p className="page-lede">Last changed by {s.updated_by} on {dateTime(s.updated_at)}.</p>}
      </div>

      <div className="card">
        <h2>Example</h2>
        <div className="detail-grid">
          <div><div className="k">Insurer&apos;s premium</div><div className="v">{fmtMoney(100_000)}</div></div>
          <div><div className="k">Markup{on ? ` (${form.type === "percent" ? `${value}%` : "fixed"})` : ""}</div><div className="v">{fmtMoney(markup)}</div></div>
          <div><div className="k">Customer pays</div><div className="v">{fmtMoney(100_000 + markup)}</div></div>
          <div><div className="k">Paid to the insurer</div><div className="v">{fmtMoney(100_000)}</div></div>
        </div>
        <p className="page-lede" style={{ marginTop: "0.75rem" }}>A change applies to quotes priced from then on; quotes already given keep their price. Switched off or set to 0, insurer prices go to customers unchanged.</p>
      </div>

      <div className="card">
        <h2>Insurer products</h2>
        <p className="page-lede">
          To stop customers quoting for an insurer&apos;s products (Leadway, emPLE), switch that insurer off on{" "}
          <Link to="/portal/insurer-products">Insurer Products</Link>.
        </p>
      </div>
    </div>
  );
}
