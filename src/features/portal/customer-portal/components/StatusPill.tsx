import type { ReactNode } from "react";

/** Policy lifecycle collapsed to the three states the cp- palette encodes. */
export type CoverStatus = "active" | "expiring" | "lapsed";

export function coverStatus(lifecycle: string, endDate: string | null | undefined): CoverStatus {
  if (lifecycle === "Expired") return "lapsed";
  const days = endDate ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000) : null;
  if (days !== null && days <= 60 && days >= 0) return "expiring";
  return "active";
}

const LABEL: Record<CoverStatus, string> = {
  active: "Active",
  expiring: "Expiring soon",
  lapsed: "Lapsed",
};

export function StatusPill({ status, children }: { status: CoverStatus; children?: ReactNode }) {
  return <span className={`cp-pill cp-pill--${status}`}>{children ?? LABEL[status]}</span>;
}
