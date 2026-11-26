import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// Admin > SMS & WhatsApp (backend platform/messaging/clientTexts.js). Texts to clients through Termii: renewal
// reminders, payment reminders and claim updates, each off until switched on here. The Termii key and sender ID are
// set in the API's Render environment (TERMII_API_KEY, TERMII_SENDER_ID), never on this page.

interface Settings { configured: boolean; renewals: boolean; payments: boolean; claims: boolean; channel: "sms" | "whatsapp"; renewalDays: number }
interface Message { id: number; channel: string; purpose: string; to_number: string | null; body: string; status: string; error: string | null; created_at: string; created_by: string | null }

const BADGE: Record<string, string> = { Sent: "badge badge-paid", Failed: "badge badge-cancelled", Skipped: "badge" };
const PURPOSE: Record<string, string> = { renewal: "Renewal", payment: "Payment", claim: "Claim", campaign: "Campaign", test: "Test" };

export function ClientTextsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["client-texts"], queryFn: () => api.get<{ settings: Settings; messages: Message[] }>("/api/client-texts") });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [testTo, setTestTo] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const settings = draft ?? query.data?.settings ?? null;
  const save = useMutation({
    mutationFn: () => api.put("/api/client-texts/settings", { ...settings, renewal_days: settings?.renewalDays }),
    onSuccess: () => { setDraft(null); setNotice("Saved."); void queryClient.invalidateQueries({ queryKey: ["client-texts"] }); },
  });
  const test = useMutation({
    mutationFn: () => api.post<{ status: string; reason: string | null }>("/api/client-texts/test", { to: testTo }),
    onSuccess: (r) => { setNotice(r.status === "Sent" ? "Test message sent." : `Test message ${r.status.toLowerCase()}: ${r.reason || ""}`); void queryClient.invalidateQueries({ queryKey: ["client-texts"] }); },
  });
  const set = (patch: Partial<Settings>) => settings && setDraft({ ...settings, ...patch });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>SMS & WhatsApp</h1>
          <p className="text-muted">Text messages to clients through Termii. Numbers come from the client's contacts, else their KYC form. A client who withdrew consent to service messages gets none; campaigns go only to clients with marketing consent.</p>
        </div>
      </div>
      {notice && <div className="flash flash-success">{notice}</div>}
      {settings && !settings.configured && (
        <div className="flash flash-warning">
          Termii is not set up yet. In Render, open the API service's Environment and add TERMII_API_KEY (from your Termii dashboard) and
          TERMII_SENDER_ID (an approved sender ID), then redeploy. Nothing is sent until then.
        </div>
      )}
      {settings && (
        <div className="card">
          <h2>What is sent</h2>
          {save.isError && <div className="flash flash-error">{(save.error as Error).message}</div>}
          <div className="form-grid">
            <label><input type="checkbox" checked={settings.renewals} onChange={(e) => set({ renewals: e.target.checked })} /> Renewal reminders</label>
            <div className="field">
              <label htmlFor="ct_days">Days before expiry</label>
              <input id="ct_days" type="number" min={1} max={120} value={settings.renewalDays} onChange={(e) => set({ renewalDays: Number(e.target.value) || 30 })} />
            </div>
            <label><input type="checkbox" checked={settings.payments} onChange={(e) => set({ payments: e.target.checked })} /> Payment reminders (15 and 30 days overdue, with the portal link)</label>
            <label><input type="checkbox" checked={settings.claims} onChange={(e) => set({ claims: e.target.checked })} /> Claim updates (each status change)</label>
            <div className="field">
              <label htmlFor="ct_channel">Send by</label>
              <select id="ct_channel" value={settings.channel} onChange={(e) => set({ channel: e.target.value as Settings["channel"] })}>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp (needs a WhatsApp sender approved on Termii)</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn" disabled={!draft || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      )}
      <div className="card">
        <h2>Send a test</h2>
        {test.isError && <div className="flash flash-error">{(test.error as Error).message}</div>}
        <div className="actions-row">
          <input aria-label="Mobile number" placeholder="08031234567" value={testTo} onChange={(e) => setTestTo(e.target.value)} style={{ maxWidth: "14rem" }} />
          <button type="button" className="btn btn-sm" disabled={!testTo.trim() || test.isPending} onClick={() => test.mutate()}>Send test</button>
        </div>
      </div>
      <div className="card">
        <h2>Messages</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>When</th><th>Kind</th><th>To</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>
              {(query.data?.messages ?? []).length === 0 && <tr><td colSpan={5}>No messages yet.</td></tr>}
              {(query.data?.messages ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{m.created_at}</td>
                  <td>{PURPOSE[m.purpose] || m.purpose}{m.channel === "whatsapp" ? " (WhatsApp)" : ""}</td>
                  <td>{m.to_number || "—"}</td>
                  <td style={{ maxWidth: "28rem" }}>{m.body}</td>
                  <td><span className={BADGE[m.status] || "badge"}>{m.status}</span>{m.error ? <div className="text-muted" style={{ fontSize: "0.8rem" }}>{m.error}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
