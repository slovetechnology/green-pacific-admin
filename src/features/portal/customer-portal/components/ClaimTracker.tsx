const STAGES = ["Filed", "Under Review", "Assessment", "Settled"];

const STATUS_TO_STAGE: Record<string, number> = {
  Filed: 0,
  "Under Review": 1,
  Assessment: 1,
  "Loss Adjuster Assigned": 2,
  "Awaiting Documents": 1,
  "Documents Complete": 1,
  "Further Documents Requested": 1,
  "Submitted to Insurer": 2,
  Approved: 2,
  Settled: 3,
  Closed: 3,
};

export function ClaimTracker({ status }: { status: string }) {
  const stageIndex = STATUS_TO_STAGE[status] ?? 0;
  const settled = status === "Settled" || status === "Closed";
  const rejected = status === "Repudiated";

  return (
    <div>
      <div className="cp-track" role="img" aria-label={`Claim stage: ${status}`}>
        {STAGES.map((_, i) => {
          const cls = rejected
            ? i === 0
              ? "cp-track-step--done"
              : ""
            : i < stageIndex
              ? "cp-track-step--done"
              : i === stageIndex
                ? settled
                  ? "cp-track-step--done"
                  : "cp-track-step--now"
                : "";
          return <div key={i} className={`cp-track-step ${cls}`} />;
        })}
      </div>
      <div className="cp-track-labels">
        {STAGES.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  );
}
