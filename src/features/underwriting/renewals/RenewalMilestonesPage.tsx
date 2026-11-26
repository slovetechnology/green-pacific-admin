import { Link } from "react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { alertDialog, promptDialog } from "@/shared/components/Dialogs";
import { fmtMoneyShort } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";

// Renewals by milestone (backend sales/renewals/renewalMilestones.js): each policy coming up for renewal fires its
// 90-, 60- and 30-day milestones once, a renewal that hasn't moved by 30 days is escalated, and one that ends without
// renewal lapses (its deal is closed as Lost).

interface Milestone { id: number; days: number; dueOn: string; status: "Fired" | "Done" | "Skipped" | "Escalated" | "Lapsed"; note: string | null; taskId: number | null; resolvedBy: string | null }
interface Item {
  transactionId: number; policyNo: string | null; client: string; insurer: string; classOfBusiness: string | null;
  endDate: string; daysLeft: number; premium: number; renewed: boolean; deal: { id: number; stage: string } | null;
  milestones: Milestone[]; column: string;
}
interface Board { today: string; activeSince: string; escalationUser: string | null; columns: string[]; items: Item[] }
interface Settings { activeSince: string; escalationUser: string | null; users: string[] }

const MILESTONE_LABEL = (days: number) => (days ? `${days}d` : "Expiry");
const TONE: Record<string, string> = { Done: "is-good", Escalated: "is-crit", Lapsed: "is-crit", Fired: "is-warn", Skipped: "" };
const COLUMN_HINT: Record<string, string> = {
  "90 days": "Review task and renewal deal raised",
  "60 days": "Renewal notice to send",
  "30 days": "Must be moving by now",
  Escalated: "Not moving at 30 days",
  Lapsed: "Ended without renewal",
  Renewed: "A later policy renews it",
};

function MilestoneChips({ item, canWrite, onResolve }: { item: Item; canWrite: boolean; onResolve: (m: Milestone) => void }) {
  return (
    <div className="pl-card-chips">
      {item.milestones.map((m) => {
        const open = m.status === "Fired" || m.status === "Escalated";
        const title = [`${MILESTONE_LABEL(m.days)} milestone (${m.dueOn}): ${m.status}`, m.note, m.resolvedBy ? `Closed by ${m.resolvedBy}` : null].filter(Boolean).join("\n");
        return canWrite && open ? (
          <button key={m.id} type="button" className={`pl-chip ${TONE[m.status] ?? ""}`} title={`${title}\nClick to close it by hand`} onClick={() => onResolve(m)}>
            {MILESTONE_LABEL(m.days)} · {m.status}
          </button>
        ) : (
          <span key={m.id} className={`pl-chip ${TONE[m.status] ?? ""}`} title={title}>{MILESTONE_LABEL(m.days)} · {m.status}</span>
        );
      })}
      {!item.milestones.length && <span className="pl-chip" title="Its first milestone hasn't fired yet">No milestone yet</span>}
    </div>
  );
}

function SettingsPanel({ settings, isAdmin, onSaved }: { settings: Settings; isAdmin: boolean; onSaved: () => void }) {
  const [user, setUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = user ?? settings.escalationUser ?? "";
  async function save() {
    setBusy(true);
    try {
      await api.put("/api/renewal-milestones/settings", { escalationUser: value });
      setUser(null);
      onSaved();
    } catch (err) {
      void alertDialog(err instanceof ApiError ? err.message : "The setting could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="exec-panel" style={{ padding: "0.8rem 1rem", marginBottom: "1rem" }} aria-label="Escalation settings">
      <div className="pl-inline-form">
        <div className="field">
          <label htmlFor="rm-escalate">Escalate stalled renewals to</label>
          <select id="rm-escalate" value={value} onChange={(e) => setUser(e.target.value)} disabled={!isAdmin}>
            <option value="">Nobody (unassigned task)</option>
            {settings.users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {isAdmin && user !== null && user !== (settings.escalationUser ?? "") && (
          <button type="button" className="btn btn-sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        )}
      </div>
      <p className="pl-hint">
        At 30 days before expiry a renewal whose deal is still at Qualified or earlier gets a High-priority task for this person.
        Milestones count from {settings.activeSince}; earlier ones were recorded as skipped.{!isAdmin && " Only an admin can change who escalations go to."}
      </p>
    </section>
  );
}

export function RenewalMilestonesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const board = useQuery({ queryKey: ["renewal-milestones"], queryFn: () => api.get<Board>("/api/renewal-milestones") });
  const settings = useQuery({ queryKey: ["renewal-milestones", "settings"], queryFn: () => api.get<Settings>("/api/renewal-milestones/settings") });
  const [running, setRunning] = useState(false);
  const items = useMemo(() => board.data?.items ?? [], [board.data]);
  const search = useRowSearch(items, (i) => [i.client, i.policyNo, i.insurer, i.classOfBusiness]);
  const canWrite = Boolean(user?.canWrite);
  const isAdmin = Boolean(user?.isAdmin);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["renewal-milestones"] });

  async function resolve(m: Milestone) {
    const note = await promptDialog({
      title: `Close the ${MILESTONE_LABEL(m.days)} milestone`,
      message: "Mark it Done if it has been handled. To skip it instead, give a reason starting with \"skip:\".",
      label: "Note", multiline: true, confirmLabel: "Close milestone",
    });
    if (note === null) return;
    const skip = /^skip:/i.test(note.trim());
    try {
      await api.patch(`/api/renewal-milestones/${m.id}`, { status: skip ? "Skipped" : "Done", note: skip ? note.trim().slice(5).trim() : note.trim() });
      await refresh();
    } catch (err) {
      void alertDialog(err instanceof ApiError ? err.message : "The milestone could not be closed.");
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const r = await api.post<{ fired: number; skipped: number; escalated: number; lapsed: number; done: number; closed: number; dealsLost: number; errors: unknown[] }>("/api/renewal-milestones/run", {});
      await refresh();
      void alertDialog(`Today's check: ${r.fired} fired, ${r.escalated} escalated, ${r.lapsed} lapsed, ${r.done} renewed at expiry, ${r.skipped} skipped, ${r.closed} closed as their outcome arrived.${r.errors.length ? ` ${r.errors.length} could not be processed (see the server log).` : ""}`);
    } catch (err) {
      void alertDialog(err instanceof ApiError ? err.message : "The check could not run.");
    } finally {
      setRunning(false);
    }
  }

  const columns = board.data?.columns ?? [];
  return (
    <div className="exec">
      <header className="exec-header">
        <div><span className="exec-eyebrow">Underwriting</span><h1>Renewal milestones</h1></div>
        <div className="exec-meta">
          <span>Policies ending in the next 90 days or in the last 30</span>
          {isAdmin && <button type="button" className="btn-secondary btn btn-sm" onClick={runNow} disabled={running}>{running ? "Checking…" : "Run today's check"}</button>}
        </div>
      </header>

      {settings.data && <SettingsPanel settings={settings.data} isAdmin={isAdmin} onSaved={refresh} />}

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Client, policy no, insurer or class…" shown={search.shown} total={search.total} />
      {board.isLoading && <p className="exec-state">Loading…</p>}
      {board.isError && <p className="exec-state is-crit">The renewals board could not be loaded.</p>}
      {board.data && (
        <div className="pl-board" role="group" aria-label="Renewals by milestone">
          {columns.map((column) => {
            const inColumn = (search.filtered ?? []).filter((i) => i.column === column);
            const premium = inColumn.reduce((s, i) => s + i.premium, 0);
            return (
              <section key={column} className={`pl-col${column === "Renewed" || column === "Lapsed" ? " is-closed" : ""}`} aria-label={column}>
                <header className="pl-col-head">
                  <h2>{column} <span className="pl-chip">{inColumn.length}</span></h2>
                  <span className="pl-col-sum" title={COLUMN_HINT[column]}>{fmtMoneyShort(premium)}</span>
                </header>
                <div className="pl-col-body">
                  {inColumn.length === 0 && <p className="pl-col-empty">None</p>}
                  {inColumn.map((i) => (
                    <article key={i.transactionId} className="pl-card" aria-label={`${i.client}, ${i.policyNo ?? `policy #${i.transactionId}`}`}>
                      <Link to={`/transactions/${i.transactionId}`} className="pl-card-title">{i.policyNo || `Policy #${i.transactionId}`}</Link>
                      <span className="pl-card-client">{i.client}</span>
                      <MilestoneChips item={i} canWrite={canWrite} onResolve={resolve} />
                      <div className="pl-card-foot">
                        <span className="pl-card-money">{fmtMoneyShort(i.premium)}</span>
                        <span>{i.daysLeft >= 0 ? `ends in ${i.daysLeft}d` : `ended ${-i.daysLeft}d ago`}</span>
                        {i.deal ? <Link to={`/deals/${i.deal.id}`} title="Renewal deal">{i.deal.stage}</Link> : <span className="muted">No deal</span>}
                      </div>
                      <p className="pl-next">{[i.classOfBusiness, i.insurer].filter(Boolean).join(" · ")}</p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
