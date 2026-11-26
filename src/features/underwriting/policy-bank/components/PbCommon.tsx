import { useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PB_TABS, usePbAccess, type ApprovalStatus } from "../api/policyBank";
import "../policybank.css";

const STATUS_CLASS: Record<string, string> = {
  Draft: "badge-prospect", Submitted: "badge-pending", UnderReview: "badge-under-review", Approved: "badge-approved", Rejected: "badge-rejected",
  Superseded: "badge-closed", Expired: "badge-closed", Deactivated: "badge-cancelled", Active: "badge-approved", Retired: "badge-closed", Inactive: "badge-closed",
};
const STATUS_LABEL: Record<string, string> = { UnderReview: "Under review" };

export function PbStatus({ status }: { status: ApprovalStatus | string | null | undefined }) {
  if (!status) return null;
  return <span className={`badge ${STATUS_CLASS[status] ?? "badge-prospect"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Flash({ error, ok }: { error?: unknown; ok?: string | null }) {
  if (error) return <div className="flash flash-error">{error instanceof Error ? error.message : String(error)}</div>;
  if (ok) return <div className="flash flash-success">{ok}</div>;
  return null;
}

/** Page frame: title, the Policy Bank sub-navigation, and a notice for someone without access. */
export function PbLayout({ title, intro, actions, children }: { title: string; intro?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { isLoading, hasAny } = usePbAccess();
  return (
    <div className="pb-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Policy Bank</p>
          <h1>{title}</h1>
          {intro && <p className="pb-intro">{intro}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      <nav className="pb-tabs" aria-label="Policy Bank">
        {PB_TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `pb-tab${isActive ? " active" : ""}`}>{t.label}</NavLink>
        ))}
      </nav>
      {isLoading ? null : hasAny ? children : (
        <div className="card empty-state">
          You don't hold a Policy Bank role. Ask an administrator to give you one (Policy Bank, Settings).
        </div>
      )}
    </div>
  );
}

/** A mutation that reports its error, says what it did, and refreshes every Policy Bank query. */
export function useAct<TArgs, TResult = unknown>(run: (args: TArgs) => Promise<TResult>, done?: (r: TResult) => string | void) {
  const client = useQueryClient();
  const [ok, setOk] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: run,
    onMutate: () => setOk(null),
    onSuccess: (r) => {
      setOk((done?.(r) as string | undefined) ?? "Saved.");
      void client.invalidateQueries({ queryKey: ["pb"] });
    },
  });
  return { ...mutation, ok };
}

/** A button that asks for a reason before it acts (reject, deactivate). */
export function ReasonButton({ label, prompt, onConfirm, disabled, className = "btn-secondary btn" }: {
  label: string; prompt: string; onConfirm: (reason: string) => void; disabled?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        const reason = window.prompt(prompt);
        if (reason && reason.trim()) onConfirm(reason.trim());
      }}
    >
      {label}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <span className="pb-hint">{hint}</span>}
    </div>
  );
}

export const fmtDate = (d: string | null | undefined) => d || "—";
export const fmtAmount = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-NG"));
