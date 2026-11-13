import { useSearchParams } from "react-router";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import { Panel } from "@/shared/components/exec/Panel";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import type { OperationsKpis, RetentionKpis, SalesKpis } from "../../api/dashboardKpis";
import { KpiCard, KpiGrid } from "./KpiCard";

const TABS: TabDef[] = [
  { id: "sales", label: "Sales & Producers" },
  { id: "retention", label: "Retention & CRM" },
  { id: "operations", label: "Operations & Claims" },
];

const days = (n: number | null, digits = 1) => (n === null ? "n/a" : `${n.toFixed(digits)} d`);

function Meter({ pct, tone }: { pct: number; tone: "good" | "warn" | "crit" | "neutral" }) {
  return (
    <div className="exec-meter" role="img" aria-label={`${pct.toFixed(0)} percent`}>
      <span className={`is-${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function SalesTab({ sales }: { sales: SalesKpis }) {
  const maxStage = Math.max(1, ...sales.pipeline.byStage.map((s) => s.value));
  return (
    <>
      <KpiGrid label="Sales and producer KPIs">
        <KpiCard
          label="Premium written"
          value={fmtMoneyShort(sales.revenue.gwp.value)}
          title={fmtMoney(sales.revenue.gwp.value)}
          deltaPct={sales.revenue.gwp.deltaPct}
          priorLabel={fmtMoneyShort(sales.revenue.gwp.prior)}
        />
        <KpiCard
          label="Brokerage commission"
          value={fmtMoneyShort(sales.revenue.commission.value)}
          title={fmtMoney(sales.revenue.commission.value)}
          deltaPct={sales.revenue.commission.deltaPct}
          priorLabel={fmtMoneyShort(sales.revenue.commission.prior)}
        />
        <KpiCard
          label="Quote-to-bind ratio"
          value={sales.quoteToBind.ratePct !== null ? fmtPct(sales.quoteToBind.ratePct) : "n/a"}
          deltaPts={sales.quoteToBind.deltaPts}
          note={`${sales.quoteToBind.bound} bound of ${sales.quoteToBind.quoted} quoted`}
        />
        <KpiCard
          label="New business ratio"
          value={sales.newBusinessRatio.valuePct !== null ? fmtPct(sales.newBusinessRatio.valuePct) : "n/a"}
          deltaPts={sales.newBusinessRatio.deltaPts}
          note={`${fmtMoneyShort(sales.newBusinessRatio.premium)} of premium`}
        />
        <KpiCard
          label="Policies per account"
          value={sales.policiesPerAccount.value.toFixed(2)}
          deltaPct={sales.policiesPerAccount.deltaPct}
          note={`${sales.policiesPerAccount.policies.toLocaleString()} policies · ${sales.policiesPerAccount.clients.toLocaleString()} clients in force`}
        />
        <KpiCard
          label="Pipeline value"
          value={fmtMoneyShort(sales.pipeline.openValue)}
          title={fmtMoney(sales.pipeline.openValue)}
          note={`${fmtMoneyShort(sales.pipeline.weightedValue)} weighted commission · ${sales.pipeline.openCount} deals`}
        />
      </KpiGrid>

      <div className="exec-grid exec-grid-2">
        <Panel eyebrow="Production" title="Producers against quota" flush>
          <div className="exec-table-wrap">
            <table className="exec-table">
              <thead>
                <tr>
                  <th scope="col">Producer</th>
                  <th scope="col" className="num">Commission</th>
                  <th scope="col" className="num">Quota (pro-rated)</th>
                  <th scope="col" className="num">Attainment</th>
                </tr>
              </thead>
              <tbody>
                {sales.producers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="exec-empty">No active producers.</td>
                  </tr>
                )}
                {sales.producers.map((p) => {
                  const tone = p.attainmentPct === null ? "neutral" : p.attainmentPct >= 100 ? "good" : p.attainmentPct >= 60 ? "warn" : "crit";
                  return (
                    <tr key={p.id}>
                      <td className="wrap">{p.name}</td>
                      <td className="num">{fmtMoneyShort(p.commission)}</td>
                      <td className="num">{p.quota ? fmtMoneyShort(p.quota) : "no quota"}</td>
                      <td className="num">
                        {p.attainmentPct === null ? (
                          "—"
                        ) : (
                          <span className="kpi-attain">
                            <span className={`exec-num is-${tone}`}>{fmtPct(p.attainmentPct, 0)}</span>
                            <Meter pct={p.attainmentPct} tone={tone} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel eyebrow="Funnel" title="Open pipeline by stage" flush>
          <div className="exec-table-wrap">
            <table className="exec-table">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col" className="num">Deals</th>
                  <th scope="col" className="num">Premium</th>
                  <th scope="col" className="num">Weighted</th>
                </tr>
              </thead>
              <tbody>
                {sales.pipeline.byStage.map((s) => (
                  <tr key={s.stage}>
                    <td className="wrap">
                      {s.stage}
                      <Meter pct={(s.value / maxStage) * 100} tone="neutral" />
                    </td>
                    <td className="num">{s.count}</td>
                    <td className="num">{fmtMoneyShort(s.value)}</td>
                    <td className="num">{fmtMoneyShort(s.weighted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

function RetentionTab({ r }: { r: RetentionKpis }) {
  const ue = r.unitEconomics;
  return (
    <>
      <KpiGrid label="Retention and CRM KPIs">
        <KpiCard
          label="Renewal rate"
          value={r.renewal.renewalRatePct !== null ? fmtPct(r.renewal.renewalRatePct) : "n/a"}
          deltaPts={r.renewal.deltaPts}
          note={r.renewal.expired ? `${r.renewal.renewed} of ${r.renewal.expired} expired policies` : "no expiries yet"}
        />
        <KpiCard
          label="Persistency (premium)"
          value={r.persistency.valuePct !== null ? fmtPct(r.persistency.valuePct) : "n/a"}
          deltaPts={r.persistency.deltaPts}
          note="premium renewed ÷ premium expiring"
        />
        <KpiCard
          label="Lapse rate"
          value={r.lapse.lapseRatePct !== null ? fmtPct(r.lapse.lapseRatePct) : "n/a"}
          tone={r.lapse.lapseRatePct !== null && r.lapse.lapseRatePct > 10 ? "crit" : "neutral"}
          deltaPts={r.lapse.deltaPts}
          lowerIsBetter
          note={`${r.lapse.cancelled} cancelled of ${r.lapse.inForce.toLocaleString()} in force`}
        />
        <KpiCard
          label="Customer churn"
          value={r.churn.churnPct !== null ? fmtPct(r.churn.churnPct) : "n/a"}
          tone={r.churn.churnPct !== null && r.churn.churnPct > 20 ? "crit" : "neutral"}
          deltaPts={r.churn.deltaPts}
          lowerIsBetter
          note={`${r.churn.lost} of ${r.churn.base.toLocaleString()} clients lost`}
        />
        <KpiCard
          label="CLTV : CAC"
          value={ue.cltvToCac !== null ? `${ue.cltvToCac.toFixed(1)}×` : "n/a"}
          tone={ue.cltvToCac === null ? "neutral" : ue.cltvToCac >= 3 ? "good" : "warn"}
          note="trailing 12 months"
        />
      </KpiGrid>

      <Panel eyebrow="Unit economics" title="Acquisition cost vs lifetime value" flush>
        <dl className="exec-dl">
          {[
            ["Clients acquired (12 mo)", ue.newClients.toLocaleString(), "first policy booked in the period"],
            ["Acquisition spend", fmtMoney(ue.acquisitionSpend), "campaign budgets only: payroll and other costs aren't tracked"],
            ["CAC", ue.cac !== null ? fmtMoney(ue.cac) : "n/a", "spend ÷ clients acquired"],
            ["Brokerage per client / year", fmtMoney(ue.arpa), undefined],
            ["Annual churn used", fmtPct(ue.annualChurnPct), "floored at 5%, which caps expected life at 20 years"],
            ["CLTV", fmtMoney(ue.cltv), "brokerage per client ÷ annual churn"],
          ].map(([label, value, note]) => (
            <div className="exec-dl-row" key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="exec-num">{value}</span>
                {note && <span className="exec-dl-note">{note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}

function OperationsTab({ ops }: { ops: OperationsKpis }) {
  const { endorsementTurnaround: end, fnol, serviceEfficiency: svc } = ops;
  return (
    <>
      <KpiGrid label="Operations and claims KPIs">
        <KpiCard
          label="Endorsement turnaround"
          value={days(end.avgDays)}
          note={
            end.sample
              ? `${end.sample} endorsements, request to recorded${end.missingRequestDate ? ` · ${end.missingRequestDate} without a request date` : ""}`
              : end.missingRequestDate
                ? `${end.missingRequestDate} endorsements have no request date`
                : "no endorsements recorded"
          }
        />
        <KpiCard
          label="FNOL → insurer"
          value={days(fnol.avgDays)}
          tone={fnol.avgDays !== null && fnol.avgDays > fnol.targetDays ? "warn" : "neutral"}
          note={fnol.withinTargetPct !== null ? `${fmtPct(fnol.withinTargetPct, 0)} within ${fnol.targetDays} days · ${fnol.sample} claims` : "no claims transmitted"}
        />
        <KpiCard
          label="Claims not yet notified"
          value={fnol.pending}
          tone={fnol.pending > 0 ? "warn" : "good"}
          note={fnol.oldestPendingDays !== null ? `oldest ${fnol.oldestPendingDays} days` : "all transmitted"}
        />
        <KpiCard
          label="Tasks closed per CSR"
          value={svc.perCsr !== null ? svc.perCsr.toFixed(1) : "n/a"}
          note={`${svc.tasksClosed} closed by ${svc.csrs} people · ${svc.overdueOpen} overdue open`}
        />
      </KpiGrid>

      <Panel eyebrow="Service team" title="Tasks closed this period" flush>
        <div className="exec-table-wrap">
          <table className="exec-table">
            <thead>
              <tr>
                <th scope="col">Assignee</th>
                <th scope="col" className="num">Closed</th>
              </tr>
            </thead>
            <tbody>
              {svc.leaders.length === 0 && (
                <tr>
                  <td colSpan={2} className="exec-empty">No tasks closed in this period.</td>
                </tr>
              )}
              {svc.leaders.map((l) => (
                <tr key={l.name}>
                  <td className="wrap">{l.name}</td>
                  <td className="num">{l.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

export function ManagerView({ sales, retention, operations }: { sales: SalesKpis; retention: RetentionKpis; operations: OperationsKpis }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as string) : "sales";
  function setTab(id: string) {
    const next = new URLSearchParams(params);
    if (id === "sales") next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: true });
  }
  return (
    <section className="exec-workspace" aria-label="Team KPIs">
      <Tabs tabs={TABS} active={tab} onChange={setTab} idPrefix="kpi" label="KPI areas" />
      <div role="tabpanel" id={`kpi-panel-${tab}`} aria-labelledby={`kpi-tab-${tab}`} tabIndex={0} className="exec-tabpanel">
        {tab === "sales" && <SalesTab sales={sales} />}
        {tab === "retention" && <RetentionTab r={retention} />}
        {tab === "operations" && <OperationsTab ops={operations} />}
      </div>
    </section>
  );
}
