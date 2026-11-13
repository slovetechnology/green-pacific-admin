// Small shared presentational pieces.
import type { ReactNode } from "react";
import "@/shared/styles/lead-portal.css";
import type { Contact, Lead, Run } from "../api";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function formatPhone(e164: string) {
  const n = e164.slice(4);
  if (n.length === 10) return `+234 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  if (n[0] === "1" || n[0] === "9") return `+234 ${n[0]} ${n.slice(1, 4)} ${n.slice(4)}`;
  return `+234 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? "high" : score >= 45 ? "mid" : "low";
  return <span className={`score score-${tone}`} title="Relevance score (0-100)">{score}</span>;
}

const FAMILY_LABEL: Record<Lead["sourceFamily"], string> = {
  tender: "Tender",
  institutional: "Institutional",
  intent: "Intent signal",
  mock: "Mock",
};
export const FamilyTag = ({ family }: { family: Lead["sourceFamily"] }) => <span className={`tag tag-${family}`}>{FAMILY_LABEL[family]}</span>;

const RUN_LABEL: Record<Run["status"], string> = { running: "Running", ok: "OK", partial: "Partial", failed: "Failed" };
export const RunStatus = ({ status }: { status: Run["status"] }) => <span className={`pill pill-${status}`}>{RUN_LABEL[status]}</span>;

export const Pill = ({ tone, children }: { tone: "ok" | "partial" | "failed" | "running" | "muted"; children: ReactNode }) => (
  <span className={`pill pill-${tone}`}>{children}</span>
);

export function ContactList({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return <span className="muted">No public contact found</span>;
  return (
    <ul className="contacts">
      {contacts.map((c) => (
        <li key={c.kind + c.value}>
          {c.kind === "email" ? <a href={`mailto:${c.value}`}>{c.value}</a> : <a href={`tel:${c.value}`}>{formatPhone(c.value)}</a>}
          {c.kind === "phone" && c.note ? <span className="muted"> · {c.note}</span> : null}
          {!c.verified ? <span className="tag tag-warn" title={c.note}>unverified</span> : null}
          {c.source === "pattern" ? <span className="muted"> · guessed</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="alert alert-danger">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Loading() {
  return <div className="loading" aria-busy="true">Loading…</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="lp-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`lp-modal${wide ? " lp-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="lp-modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="lp-modal-body">{children}</div>
      </div>
    </div>
  );
}
