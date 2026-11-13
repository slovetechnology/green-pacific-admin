import { Link } from "react-router";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { Panel } from "@/shared/components/exec/Panel";
import type { ProducerKpis, RenewalItem } from "../../api/dashboardKpis";
import { KpiCard, KpiGrid } from "./KpiCard";

function fmtDate(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function hours(h: number | null): string {
  if (h === null) return "n/a";
  return h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

// Renewals bucketed the way a producer works through them.
function groupRenewals(items: RenewalItem[]): { label: string; tone: "crit" | "warn" | "neutral"; rows: RenewalItem[] }[] {
  const groups = [
    { label: "Overdue", tone: "crit" as const, rows: items.filter((r) => r.daysLeft < 0) },
    { label: "Next 14 days", tone: "warn" as const, rows: items.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 14) },
    { label: "15–30 days", tone: "neutral" as const, rows: items.filter((r) => r.daysLeft > 14 && r.daysLeft <= 30) },
    { label: "31–60 days", tone: "neutral" as const, rows: items.filter((r) => r.daysLeft > 30) },
  ];
  return groups.filter((g) => g.rows.length);
}

export function ProducerView({ data }: { data: ProducerKpis }) {
  const { pipeline, speedToLead: speed, renewals, tasks } = data;
  const groups = groupRenewals(renewals.items);
  return (
    <>
      {!data.producerLinked && (
        <p className="exec-state" role="status">
          Your login isn't linked to a producer record yet, so pipeline and speed-to-lead are empty. Ask an administrator to link it on the Producers page.
        </p>
      )}

      <KpiGrid label="Your KPIs">
        <KpiCard
          label="My premium written"
          value={fmtMoneyShort(data.revenue.gwp.value)}
          title={fmtMoney(data.revenue.gwp.value)}
          deltaPct={data.revenue.gwp.deltaPct}
          priorLabel={fmtMoneyShort(data.revenue.gwp.prior)}
          note="my clients' policies"
        />
        <KpiCard
          label="My brokerage"
          value={fmtMoneyShort(data.revenue.commission.value)}
          title={fmtMoney(data.revenue.commission.value)}
          deltaPct={data.revenue.commission.deltaPct}
          priorLabel={fmtMoneyShort(data.revenue.commission.prior)}
        />
        <KpiCard
          label="My open pipeline"
          value={pipeline ? fmtMoneyShort(pipeline.openValue) : "—"}
          title={pipeline ? fmtMoney(pipeline.openValue) : undefined}
          note={pipeline ? `${pipeline.openCount} deals · ${fmtMoneyShort(pipeline.weightedValue)} weighted` : undefined}
        />
        <KpiCard
          label="Speed to lead"
          value={hours(speed.medianHours)}
          tone={speed.untouched > 0 ? "warn" : "neutral"}
          note={speed.sample ? `median first touch · ${speed.untouched} untouched >24h` : speed.untouched ? `${speed.untouched} untouched >24h` : "no new deals this year"}
        />
        <KpiCard
          label="Renewals in 14 days"
          value={renewals.next14}
          tone={renewals.overdue > 0 ? "crit" : renewals.next14 > 0 ? "warn" : "neutral"}
          note={renewals.overdue ? `${renewals.overdue} overdue · ${renewals.next60} due in 60 days` : `${renewals.next60} due in 60 days`}
        />
        <KpiCard
          label="My open tasks"
          value={tasks.open}
          tone={tasks.overdue > 0 ? "crit" : "neutral"}
          note={`${tasks.overdue} overdue · ${tasks.dueToday} due today`}
        />
      </KpiGrid>

      <div className="exec-grid exec-grid-2">
        <Panel
          eyebrow="Renewals"
          title="My renewal calendar"
          flush
          actions={
            <Link className="exec-link" to="/renewals">
              All renewals →
            </Link>
          }
        >
          {groups.length === 0 ? (
            <p className="exec-state">Nothing due in the next 60 days.</p>
          ) : (
            <div className="kpi-cal">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className={`kpi-cal-head is-${g.tone}`}>
                    {g.label} <span>{g.rows.length}</span>
                  </div>
                  <ul>
                    {g.rows.map((r) => (
                      <li key={r.id}>
                        <span className="kpi-cal-date">{fmtDate(r.endDate)}</span>
                        <Link to={`/transactions/${r.id}`}>{r.client}</Link>
                        <span className="kpi-cal-meta">
                          {r.classOfBusiness || r.policyNo || "Policy"} · {fmtMoneyShort(r.premium)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Tasks"
          title="My task queue"
          flush
        >
          {tasks.items.length === 0 ? (
            <p className="exec-state">No open tasks assigned to you.</p>
          ) : (
            <ul className="kpi-queue">
              {tasks.items.map((t) => {
                const late = t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
                return (
                  <li key={t.id}>
                    <span className="kpi-queue-title">{t.title}</span>
                    <span className={late ? "exec-chip is-warn" : "exec-chip"}>{t.dueDate ? `${late ? "Overdue · " : ""}${fmtDate(t.dueDate)}` : "No date"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel eyebrow="Pipeline" title="My open deals" flush>
        <div className="exec-table-wrap">
          <table className="exec-table">
            <thead>
              <tr>
                <th scope="col">Deal</th>
                <th scope="col">Client</th>
                <th scope="col">Stage</th>
                <th scope="col" className="num">Premium</th>
                <th scope="col" className="num">Probability</th>
                <th scope="col">Expected close</th>
              </tr>
            </thead>
            <tbody>
              {data.deals.length === 0 && (
                <tr>
                  <td colSpan={6} className="exec-empty">No open deals.</td>
                </tr>
              )}
              {data.deals.map((d) => (
                <tr key={d.id}>
                  <td className="wrap">{d.name}</td>
                  <td className="wrap">{d.client}</td>
                  <td>{d.stage}</td>
                  <td className="num">{fmtMoney(d.premium)}</td>
                  <td className="num">{d.probability}%</td>
                  <td className="nowrap">{d.expectedClose ? fmtDate(d.expectedClose) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
