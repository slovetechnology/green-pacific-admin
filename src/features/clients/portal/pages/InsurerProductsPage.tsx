import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { dateTime } from "../api";

interface ProviderSwitches {
  providers: { code: string; name: string; enabled: boolean }[];
  updated_by: string | null;
  updated_at: string | null;
}

// Which third-party insurers' products customers can quote for in the portal. Everyone on staff can see it; only
// admins switch an insurer on or off.
export function InsurerProductsPage() {
  const { user } = useAuth();
  const canEdit = !!user?.isAdmin;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["portal-providers"], queryFn: () => api.get<{ data: ProviderSwitches }>("/api/customer-portal-providers") });
  const s = data?.data;
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(code: string, name: string, enabled: boolean) {
    if (!enabled && !window.confirm(`Switch ${name} off? Customers will no longer see or quote for its products until it is switched back on.`)) return;
    setError(null);
    setSaved(null);
    setBusy(code);
    try {
      await api.put("/api/customer-portal-providers", { [code]: enabled });
      setSaved(`${name} switched ${enabled ? "on" : "off"}. Customers see the change straight away.`);
      await queryClient.invalidateQueries({ queryKey: ["portal-providers"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !s) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer portal</p>
          <h1>Insurer Products</h1>
          <p className="page-lede">
            Switch an insurer off to hide all its products from the portal: customers can&apos;t see them, start a quote or submit an unfinished one. Quotes
            already submitted, policies and staff work carry on as normal. {canEdit ? "" : "Only an admin can change this."}
          </p>
        </div>
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {saved && <div className="flash flash-success">{saved}</div>}

      <div className="card">
        <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Insurer</th><th>Status</th>{canEdit && <th aria-label="Actions" />}</tr>
          </thead>
          <tbody>
            {s.providers.map((p) => (
              <tr key={p.code}>
                <td>{p.name}</td>
                <td><StatusBadge status={p.enabled ? "On" : "Off"} /></td>
                {canEdit && (
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className={p.enabled ? "btn-secondary btn btn-sm" : "btn btn-sm"} disabled={busy !== null} onClick={() => toggle(p.code, p.name, !p.enabled)}>
                      {busy === p.code ? "Saving…" : p.enabled ? "Switch off" : "Switch on"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {s.updated_at && <p className="page-lede" style={{ marginTop: "0.75rem" }}>Last changed by {s.updated_by} on {dateTime(s.updated_at)}.</p>}
      </div>
    </div>
  );
}
