import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Panel } from "@/shared/components/exec/Panel";
import { PRIORITY_CLASS, heldList, type ClaimExperience, type CoverageGaps, type Gap, type PolicyExperience } from "../api/types";
import { RiskReportModal } from "./RiskReportModal";
import "../risk.css";

const PERIODS = [
  { value: "policy_year", label: "Current policy year" },
  { value: "12m", label: "Last 12 months" },
  { value: "3y", label: "3-year history" },
  { value: "all", label: "All time" },
];
const TIERS = ["Profitable / Low Risk", "Moderate / Watchlist", "Loss-Making / High Risk", "No exposure"];
const PAGE = 25;

type SortKey = "policy_no" | "class_of_business" | "start_date" | "earned_premium" | "incurred" | "claim_count" | "loss_ratio" | "underwriting_profit" | "brokerage_net";

export function ToneBadge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge-tone-${tone}`}>{children}</span>;
}

// Quick actions on a gap: start a deal (quote) or a policy for the class, both pre-filled.
function GapActions({ clientId, gap }: { clientId: string; gap: Gap }) {
  const cls = encodeURIComponent(gap.suggested_class || gap.policy_class);
  return (
    <RoleGate need="write">
      <div className="risk-gap-actions">
        {gap.transaction_id && (gap.gap_type === "Expiring" || gap.gap_type === "Lapsed") ? (
          <Link className="btn btn-secondary btn-sm" to={`/transactions/${gap.transaction_id}`}>
            Open policy
          </Link>
        ) : (
          <>
            <Link className="btn btn-sm" to={`/deals/new?client_id=${clientId}&class_of_business=${cls}`}>
              Create quote
            </Link>
            <Link className="btn btn-secondary btn-sm" to={`/transactions/new?client_id=${clientId}&class_of_business=${cls}`}>
              Add policy
            </Link>
          </>
        )}
      </div>
    </RoleGate>
  );
}

function GapList({ clientId, gaps, empty }: { clientId: string; gaps: Gap[]; empty: string }) {
  if (!gaps.length) return <p className="risk-empty">{empty}</p>;
  return (
    <ul className="risk-gaps">
      {gaps.map((g, i) => (
        <li key={`${g.rule_code ?? g.transaction_id}-${g.gap_type}-${i}`} className={`risk-gap${g.priority === "Critical" ? " is-critical" : ""}`}>
          <div className="risk-gap-head">
            <span className={`badge ${PRIORITY_CLASS[g.priority]}`}>{g.priority}</span>
            <strong>{g.policy_class}</strong>
            <span className="exec-chip">{g.gap_type}</span>
            {g.band && <span className="exec-chip is-warn">{g.band}</span>}
          </div>
          <p>{g.rationale}</p>
          {g.suggested_coverage_scope && (
            <p>
              <b>Suggested cover:</b> {g.suggested_coverage_scope}
              {g.estimated_minimum_sum_insured ? ` Minimum sum insured about ${fmtMoney(g.estimated_minimum_sum_insured)}.` : ""}
            </p>
          )}
          {g.regulatory_reference && <span className="risk-gap-ref">Reference: {g.regulatory_reference}</span>}
          <GapActions clientId={clientId} gap={g} />
        </li>
      ))}
    </ul>
  );
}

export function RiskAnalyticsTab({ clientId }: { clientId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = PERIODS.some((p) => p.value === searchParams.get("period")) ? (searchParams.get("period") as string) : "12m";
  const [reportOpen, setReportOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "earned_premium", dir: -1 });
  const [tier, setTier] = useState("");
  const [search, setSearch] = useState("");
  const [inForceOnly, setInForceOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const experienceQuery = useQuery({
    queryKey: ["risk-analytics", clientId, "experience", period],
    queryFn: () => api.get<ClaimExperience>(`/api/clients/${clientId}/analytics/claim-experience?period=${period}`),
  });
  const gapsQuery = useQuery({
    queryKey: ["risk-analytics", clientId, "gaps"],
    queryFn: () => api.get<CoverageGaps>(`/api/clients/${clientId}/analytics/coverage-gaps`),
  });

  function setPeriod(value: string) {
    const next = new URLSearchParams(searchParams);
    next.set("period", value);
    setSearchParams(next, { replace: true });
    setLimit(PAGE);
  }

  const rows = useMemo(() => {
    const all = experienceQuery.data?.policies ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = all.filter(
      (p) =>
        (!tier || p.tier === tier) &&
        (!inForceOnly || p.in_force) &&
        (!needle || [p.policy_no, p.class_of_business].some((v) => String(v ?? "").toLowerCase().includes(needle)))
    );
    const val = (p: PolicyExperience) => p[sort.key];
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [experienceQuery.data, tier, inForceOnly, search, sort]);

  if (experienceQuery.isLoading || gapsQuery.isLoading) return <p className="exec-state">Loading risk analytics…</p>;
  if (experienceQuery.isError || gapsQuery.isError || !experienceQuery.data || !gapsQuery.data) {
    return <p className="exec-state is-crit">Could not load risk analytics.</p>;
  }
  const x = experienceQuery.data;
  const g = gapsQuery.data;
  const p = x.portfolio;
  const c = g.compliance;

  const metrics: Metric[] = [
    { key: "lr", label: "Portfolio loss ratio", value: fmtPct(p.loss_ratio), tone: p.tone, note: `${p.claim_count} claim(s)` },
    { key: "earned", label: "Earned premium", value: fmtMoneyShort(p.earned_premium), title: fmtMoney(p.earned_premium), note: `of ${fmtMoneyShort(p.written_premium)} written` },
    { key: "incurred", label: "Incurred claims", value: fmtMoneyShort(p.incurred), title: fmtMoney(p.incurred), tone: p.incurred > 0 ? "warn" : "neutral", note: `Severity ${fmtMoneyShort(p.severity)}` },
    { key: "net", label: "Net brokerage", value: fmtMoneyShort(p.brokerage_net), title: fmtMoney(p.brokerage_net), tone: p.brokerage_net >= 0 ? "good" : "crit", note: `UW result ${fmtMoneyShort(p.underwriting_profit)}` },
    { key: "tier", label: "Risk rating", value: <ToneBadge tone={p.tone}>{p.tier}</ToneBadge> },
    { key: "compliance", label: "Statutory compliance", value: <ToneBadge tone={c.tone}>{c.status}</ToneBadge>, note: c.label },
  ];

  function header(label: string, key: SortKey, num = false) {
    const active = sort.key === key;
    return (
      <th className={num ? "num" : undefined} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" className="risk-sort" onClick={() => setSort({ key, dir: active ? (sort.dir === 1 ? -1 : 1) : num ? -1 : 1 })}>
          {label}
          <span aria-hidden="true">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  }

  const statutoryNeeds = c.rules.filter((r) => r.status === "Unknown");

  return (
    <>
      <div className="risk-toolbar">
        <label className="exec-filter">
          <span>Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className="risk-report-meta">
          {x.window.from ? `${x.window.from} to ${x.window.to}` : `Policies in force, to ${x.window.to}`}
        </span>
        <div className="risk-toolbar-actions">
          <RoleGate need="write">
            <Link className="btn btn-secondary btn-sm" to={`/clients/${clientId}/risk-profile`}>
              {g.hasProfile ? "Edit risk profile" : "Complete risk profile"}
            </Link>
          </RoleGate>
          <button type="button" className="btn btn-sm" onClick={() => setReportOpen(true)}>
            Risk management report
          </button>
        </div>
      </div>

      {c.status !== "Compliant" && (
        <div className={`exec-alert${c.tone === "crit" ? " is-crit" : ""}`} role="status">
          <span className="exec-alert-dot" aria-hidden="true" />
          <p>
            <b>
              {c.status === "Non-Compliant"
                ? `Regulatory non-compliance: ${c.nonCompliant} compulsory insurance(s) missing.`
                : c.status === "Under-insured"
                  ? "A compulsory cover is below its statutory minimum."
                  : `${c.unknown} compulsory requirement(s) can't be checked yet.`}
            </b>
            <span className="exec-alert-counts">
              {c.label}
              {c.unknown > 0 && ` · ${c.unknown} need profile data (${statutoryNeeds.map((r) => r.policy_class).join(", ")})`}
            </span>
          </p>
        </div>
      )}

      <MetricStrip metrics={metrics} label="Risk and portfolio summary" />

      <Panel
        title="Policy claim experience"
        eyebrow={x.periodLabel}
        flush
        actions={
          <div className="risk-toolbar">
            <label className="exec-filter">
              <span>Find</span>
              <input type="search" placeholder="Policy no or class" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label className="exec-filter">
              <span>Tier</span>
              <select value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="">All</option>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="exec-filter" style={{ flexDirection: "row", alignItems: "center", gap: "0.35rem" }}>
              <input type="checkbox" checked={inForceOnly} onChange={(e) => setInForceOnly(e.target.checked)} />
              <span>In force only</span>
            </label>
          </div>
        }
      >
        <div className="exec-table-wrap">
          <table className="exec-table is-static risk-table">
            <thead>
              <tr>
                {header("Policy", "policy_no")}
                {header("Class", "class_of_business")}
                {header("Term", "start_date")}
                {header("Earned", "earned_premium", true)}
                {header("Claims", "claim_count", true)}
                {header("Incurred", "incurred", true)}
                {header("Loss ratio", "loss_ratio", true)}
                {header("UW result", "underwriting_profit", true)}
                {header("Brokerage net", "brokerage_net", true)}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10}>No policies in this period.</td>
                </tr>
              )}
              {rows.slice(0, limit).map((r) => (
                <tr key={r.transaction_id}>
                  <td>
                    <Link to={`/transactions/${r.transaction_id}`}>{r.policy_no || `#${r.transaction_id}`}</Link>
                    {!r.in_force && <div className="exec-dl-note">Expired</div>}
                  </td>
                  <td>{r.class_of_business || "—"}</td>
                  <td className="risk-term">
                    {r.start_date} – {r.end_date}
                    {r.earned_fraction < 100 && <div className="exec-dl-note">{r.earned_fraction}% earned in period</div>}
                  </td>
                  <td className="num" title={`Written ${fmtMoney(r.written_premium)}`}>{fmtMoney(r.earned_premium)}</td>
                  <td className="num">{r.claim_count}</td>
                  <td className="num" title={`Paid ${fmtMoney(r.paid)} + outstanding ${fmtMoney(r.outstanding)} − recoveries ${fmtMoney(r.recoveries)}`}>
                    {fmtMoney(r.incurred)}
                    {r.reserves_estimated && <div className="exec-dl-note">Reserve estimated</div>}
                  </td>
                  <td className="num">{fmtPct(r.loss_ratio)}</td>
                  <td className="num">{fmtMoney(r.underwriting_profit)}</td>
                  <td className="num">{fmtMoney(r.brokerage_net)}</td>
                  <td>
                    <ToneBadge tone={r.tone}>{r.tier}</ToneBadge>
                  </td>
                </tr>
              ))}
              {x.unlinkedClaims.claim_count > 0 && !tier && !search && (
                <tr>
                  <td colSpan={4}>
                    Claims not on a listed policy
                    <div className="exec-dl-note">{x.unlinkedClaims.claims.join(", ")}</div>
                  </td>
                  <td className="num">{x.unlinkedClaims.claim_count}</td>
                  <td className="num">{fmtMoney(x.unlinkedClaims.incurred)}</td>
                  <td colSpan={4} />
                </tr>
              )}
              <tr className="is-total">
                <td colSpan={3}>Portfolio</td>
                <td className="num">{fmtMoney(p.earned_premium)}</td>
                <td className="num">{p.claim_count}</td>
                <td className="num">{fmtMoney(p.incurred)}</td>
                <td className="num">{fmtPct(p.loss_ratio)}</td>
                <td className="num">{fmtMoney(p.underwriting_profit)}</td>
                <td className="num">{fmtMoney(p.brokerage_net)}</td>
                <td>
                  <ToneBadge tone={p.tone}>{p.tier}</ToneBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="risk-table-foot">
          <span>
            Showing {Math.min(limit, rows.length)} of {rows.length} · Loss ratio tiers: under {x.settings.tier_watch_pct}% low risk, {x.settings.tier_watch_pct}–
            {x.settings.tier_high_pct}% watchlist, over {x.settings.tier_high_pct}% high risk
            {x.reservesEstimated && " · Some open claims have no reserve; estimated from approved or claimed less excess"}
          </span>
          {rows.length > limit && (
            <button type="button" className="exec-filter-clear" onClick={() => setLimit((n) => n + PAGE * 4)}>
              Show more
            </button>
          )}
        </div>
      </Panel>

      <div className="exec-grid exec-grid-2">
        <Panel title="Mandatory / statutory gaps" eyebrow={`Tier A · ${c.label}`} flush>
          <GapList clientId={clientId} gaps={g.gaps.statutory} empty="No missing compulsory insurance on current data." />
          <h3 className="exec-sub" style={{ padding: "0.6rem var(--exec-pad) 0" }}>
            Compliance checklist
          </h3>
          <ul className="risk-checklist">
            {c.rules.map((r) => (
              <li key={r.rule_code}>
                <span className={`badge badge-${r.status.toLowerCase().replace(/\s+/g, "-")}`}>{r.status}</span>
                <span>
                  {r.policy_class}
                  <br />
                  <span className="risk-check-detail">
                    {r.status === "Compliant"
                      ? r.exempt
                        ? "Exempt (recorded on the risk profile)"
                        : `In force: ${heldList(r.held_policies)}`
                      : r.status === "Unknown"
                        ? r.rationale
                        : r.regulatory_reference}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recommended commercial covers" eyebrow="Tier B" flush>
          <GapList clientId={clientId} gaps={g.gaps.commercial} empty="No commercial cover gaps on current data." />
        </Panel>
      </div>

      <div className="exec-grid exec-grid-2">
        <Panel title="Limits & under-insurance" flush>
          <GapList clientId={clientId} gaps={g.gaps.limits} empty="No limit or sum insured issues found." />
        </Panel>
        <Panel title="Expiring & lapsed cover" eyebrow="Next 90 days, or lapsed in the last 60" flush>
          <GapList clientId={clientId} gaps={g.gaps.expiring} empty="Nothing expiring without renewal terms." />
        </Panel>
      </div>

      <Panel
        title="Risk facts used"
        eyebrow={g.profileReviewedAt ? `Profile reviewed ${g.profileReviewedAt}` : "No risk profile recorded yet"}
        flush
      >
        {g.facts.length === 0 ? (
          <p className="risk-empty">Nothing is known about this client's risks yet. Complete the risk profile to check compulsory insurances.</p>
        ) : (
          <div className="risk-facts">
            {g.facts.map((f) => (
              <span key={f.field} className="risk-fact" title={f.note ?? undefined}>
                {f.label}: <b>{typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : typeof f.value === "number" && f.field === "annual_payroll" ? fmtMoneyShort(f.value) : String(f.value)}</b>
                <em>{f.source === "profile" ? "profile" : f.source === "kyc" ? "KYC" : "inferred"}</em>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <RiskReportModal open={reportOpen} onClose={() => setReportOpen(false)} clientId={clientId} period={period} />
    </>
  );
}
