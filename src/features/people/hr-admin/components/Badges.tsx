import type { ExpiryBand } from "../lib/types";

// How close to expiry. The text carries the meaning; colour is only a reinforcement.
export function ExpiryBadge({ band, date }: { band: ExpiryBand; date?: string | null }) {
  const label =
    band === "expired" ? "Expired"
    : band === 30 ? "≤ 30 days"
    : band === 60 ? "≤ 60 days"
    : band === 90 ? "≤ 90 days"
    : band === "ok" ? "Current"
    : band === "none" ? "No expiry"
    : String(band).replace(/^./, (c) => c.toUpperCase());
  return (
    <span className={`hr-band hr-band-${band}`} title={date ? `Expires ${date}` : undefined}>
      {label}
      {date ? <span className="hr-band-date"> · {date}</span> : null}
    </span>
  );
}

// Where a figure came from, so nobody mistakes a typed number for a system one (appraisal KPIs).
export function SourceBadge({ source, adjusted }: { source: "auto" | "manual"; adjusted?: boolean }) {
  return (
    <>
      <span className={`hr-source hr-source-${source}`} title={source === "auto" ? "Calculated from the ERP's records" : "Entered by a person"}>
        {source === "auto" ? "Auto-fetched" : "Manually entered"}
      </span>
      {adjusted && (
        <span className="hr-source hr-source-adjusted" title="A reviewer corrected the system figure; the reason is on record">
          Adjusted
        </span>
      )}
    </>
  );
}

export function Notice({ notice }: { notice: { kind: "success" | "error"; text: string } | null }) {
  if (!notice) return null;
  return (
    <div className={`flash flash-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      {notice.text}
    </div>
  );
}
