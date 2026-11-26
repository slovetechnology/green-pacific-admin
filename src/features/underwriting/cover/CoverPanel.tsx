import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { alertDialog, promptDialog } from "@/shared/components/Dialogs";
import { fmtMoney } from "@/shared/lib/format";
import { useAuth } from "@/features/platform/auth/AuthContext";

// A policy's cover (No Premium, No Cover) and issuance checks (backend underwriting/cover/coverStatus.js): cover
// status and its deadline, the schedule verification someone other than the policy's maker gives before the notes
// are issued, and an admin's override of unpaid cover.

interface CoverView {
  transactionId: number;
  coverStatus: "Pending Payment" | "In Force" | "Suspended" | "Lapsed" | "Cancelled" | "Expired";
  coverDeadline: string | null;
  coverActivatedAt: string | null;
  blocksInClass: boolean;
  graceDays: number;
  override: { by: string; at: string; reason: string } | null;
  issued: boolean;
  maker: string | null;
  verification: { by: string; at: string } | null;
  verifyRequired: boolean;
  canVerify: boolean;
  balanceOs: number;
  premiumDue: number;
}

const coverKey =(txId: number) => ["transactions", String(txId), "cover"];

const COVER_HINT: Record<string, string> = {
  "Pending Payment": "Cover holds until the deadline while the premium is unpaid; it goes In Force once paid in full.",
  Suspended: "The premium wasn't paid by the deadline: there is no cover until it is paid (or an admin overrides).",
  "In Force": "",
};

export function CoverPanel({ txId, onChanged }: { txId: number; onChanged?: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: coverKey(txId), queryFn: () => api.get<CoverView>(`/api/cover/policies/${txId}`) });
  if (!data) return null;

  async function act(work: () => Promise<unknown>, ok: string) {
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ["transactions", String(txId)] });
      onChanged?.();
      void alertDialog(ok);
    } catch (err) {
      void alertDialog(err instanceof ApiError ? err.message : "That didn't work. Please try again.");
    }
  }

  async function override() {
    const reason = await promptDialog({ title: "Override No Premium, No Cover", message: `Outstanding premium ${fmtMoney(data!.balanceOs)}. Cover goes In Force now; the reason is kept in the audit log.`, label: "Reason", required: true, multiline: true, confirmLabel: "Put cover In Force" });
    if (reason === null) return;
    await act(() => api.post(`/api/cover/policies/${txId}/npnc-override`, { reason }), "Cover is In Force.");
  }

  const waiting = data.coverStatus === "Pending Payment" || data.coverStatus === "Suspended";
  return (
    <div className={`ee-banner${data.coverStatus === "Suspended" ? " is-cancelled" : waiting ? " is-draft" : ""}`} role="status" aria-label="Cover and issuance">
      <strong>Cover</strong>
      <StatusBadge status={data.coverStatus} />
      {waiting && data.coverDeadline && <span>{data.coverStatus === "Suspended" ? "lapsed on" : "until"} {data.coverDeadline} · {fmtMoney(data.balanceOs)} unpaid</span>}
      {COVER_HINT[data.coverStatus] && <span className="muted">{COVER_HINT[data.coverStatus]}</span>}
      {data.override && <span className="muted">Overridden by {data.override.by} on {String(data.override.at).slice(0, 10)}: {data.override.reason}</span>}
      {!data.issued && (
        <>
          <span className="ee-spacer" />
          {data.verification ? <span className="ee-chip is-ok">Schedule verified by {data.verification.by}</span>
            : data.verifyRequired ? <span className="ee-chip is-warn">Schedule not verified{data.maker ? ` (entered by ${data.maker})` : ""}</span> : null}
          {!data.verification && data.canVerify && user?.canWrite && (
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => act(() => api.post(`/api/cover/policies/${txId}/verify-schedule`, {}), "Schedule verified. The notes can be issued.")}>Verify schedule</button>
          )}
          {!data.verification && data.verifyRequired && !data.canVerify && <span className="muted">You entered this policy; someone else must verify it.</span>}
        </>
      )}
      {waiting && user?.isAdmin && <button type="button" className="btn-secondary btn btn-sm" onClick={override}>Override</button>}
    </div>
  );
}
