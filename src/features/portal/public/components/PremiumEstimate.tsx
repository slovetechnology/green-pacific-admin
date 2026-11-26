import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { estimatePremium, formatAmount, type Answers } from "../lib/premiumEstimate";

// The "Estimated premium" box: a range, what it is based on, and a reminder that the insurer's quote
// decides. Life cover is priced by the server's mortality table (/api/marketplace/life-quote).

interface LifeQuote {
  annual_premium: number;
}

export function PremiumEstimate({ className, formId, answers, compact }: { className: string; formId?: string; answers: Answers; compact?: boolean }) {
  const result = estimatePremium(className, formId, answers);
  const life = result?.kind === "life" ? result : null;
  const lifeQuote = useQuery({
    queryKey: ["life-quote", life?.age, life?.gender, life?.smoker, life?.term, life?.coverage],
    queryFn: () => api.post<LifeQuote>("/api/marketplace/life-quote", life),
    enabled: !!life,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (!result) return null;

  let body;
  if (result.kind === "none") {
    body = <p className="estimate-basis">{result.reason}</p>;
  } else if (result.kind === "incomplete") {
    body = <p className="estimate-basis">{result.need}</p>;
  } else if (result.kind === "life") {
    if (lifeQuote.isLoading) body = <p className="estimate-basis">Working out your estimate…</p>;
    else if (!lifeQuote.data) body = <p className="estimate-basis">{lifeQuote.error instanceof Error ? lifeQuote.error.message : "We couldn't estimate this one online; we'll price it for you."}</p>;
    else {
      const annual = lifeQuote.data.annual_premium;
      body = (
        <>
          <div className="estimate-amount">{formatAmount(annual * 0.9, "NGN")} – {formatAmount(annual * 1.2, "NGN")} <span>a year</span></div>
          <p className="estimate-basis">{formatAmount(life!.coverage, "NGN")} cover for {life!.term} years, priced from standard mortality tables. The insurer may ask for a medical.</p>
        </>
      );
    }
  } else {
    body = (
      <>
        <div className="estimate-amount">
          {result.low === result.high ? formatAmount(result.low, result.currency) : `${formatAmount(result.low, result.currency)} – ${formatAmount(result.high, result.currency)}`}
          <span> {result.period ?? "a year"}</span>
        </div>
        <p className="estimate-basis">{result.basis}</p>
        {result.note && <p className="estimate-basis">{result.note}</p>}
      </>
    );
  }

  return (
    <div className={`estimate-box${compact ? " estimate-box--compact" : ""}`} aria-live="polite">
      <div className="estimate-label">Estimated premium</div>
      {body}
      <p className="estimate-disclaimer">An indication only, from the industry fire tariff and our table of rates. Your exact premium comes with the insurer's quote.</p>
    </div>
  );
}
