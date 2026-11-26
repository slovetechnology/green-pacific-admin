import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoneyShort, fmtPct } from "@/shared/lib/format";

interface RiskMarker {
  id: string;
  name: string;
  score: number;
  zone_label: string;
}

interface GridCell {
  impact: number;
  likelihood: number;
  score: number;
  zone_cls: string;
  zone_label: string;
  markers: RiskMarker[];
}

interface BusinessRisk {
  id: string;
  name: string;
  category: string;
  evidence: string;
  likelihood: number;
  impact: number;
  score: number;
  zone_cls: string;
  zone_label: string;
  response: string;
  action: string;
}

interface ClientRisk {
  id: string;
  client_id: number;
  name: string;
  state: string | null;
  premium_due: number;
  premium_share: number;
  balance_os: number;
  os_ratio: number;
  n_cancelled: number;
  zone_cls: string;
  zone_label: string;
}

interface Response {
  business_risks: BusinessRisk[];
  business_grid: GridCell[][];
  client_risks: ClientRisk[];
  client_grid: GridCell[][];
  zone_counts: { crit: number; high: number; med: number; low: number };
  impact_labels: string[];
  likelihood_labels: string[];
  generated_date: string;
}

function RiskGridChart({ grid, likelihoodLabels, impactLabels }: { grid: GridCell[][]; likelihoodLabels: string[]; impactLabels: string[] }) {
  return (
    <>
      <div className="risk-matrix-layout">
        <div className="risk-y-label">Impact</div>
        <div className="risk-grid-wrap">
          <div className="risk-grid">
            <div></div>
            {likelihoodLabels.map((lbl, i) => (
              <div className="risk-col-label" key={lbl}>{lbl}<span className="n">{i + 1}</span></div>
            ))}
            {grid.map((row, rowIdx) => (
              <Fragment key={`row-${rowIdx}`}>
                <div className="risk-row-label">{impactLabels[rowIdx]}<span className="n">{row[0].impact}</span></div>
                {row.map((cell) => (
                  <div className={`risk-cell zone-${cell.zone_cls}`} key={`${cell.impact}-${cell.likelihood}`}>
                    {cell.markers.map((m) => (
                      <span className="risk-chip" key={m.id} title={`${m.id} · ${m.name} (score ${m.score}, ${m.zone_label})`}>
                        {m.id}
                      </span>
                    ))}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="risk-x-label">Likelihood →</div>
      </div>
      <div className="risk-legend">
        <div className="risk-legend-item"><span className="swatch" style={{ background: "var(--status-good)" }}></span>Low (1–4) — accept &amp; monitor</div>
        <div className="risk-legend-item"><span className="swatch" style={{ background: "var(--status-warning)" }}></span>Medium (5–9) — monitor &amp; mitigate</div>
        <div className="risk-legend-item"><span className="swatch" style={{ background: "var(--status-serious)" }}></span>High (10–14) — actively mitigate</div>
        <div className="risk-legend-item"><span className="swatch" style={{ background: "var(--status-critical)" }}></span>Critical (15–25) — treat immediately</div>
      </div>
    </>
  );
}

export function RiskMatrixPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "risk-matrix"],
    queryFn: () => api.get<Response>("/api/reports/risk-matrix"),
  });

  if (isLoading || !data) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Risk Assessment Matrix</h1>
      </div>
      <p className="period-note">
        Computed live from the current database on {new Date(data.generated_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} — not a static
        snapshot. Score = Likelihood × Impact (1–5 each), banded Low (1–4) / Medium (5–9) /
        High (10–14) / Critical (15–25).
      </p>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">Critical risks</div>
          <div className="kpi-value" style={{ color: "var(--status-critical)" }}>{data.zone_counts.crit}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">High risks</div>
          <div className="kpi-value" style={{ color: "var(--status-serious)" }}>{data.zone_counts.high}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Medium risks</div>
          <div className="kpi-value" style={{ color: "var(--status-warning)" }}>{data.zone_counts.med}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Low risks</div>
          <div className="kpi-value" style={{ color: "var(--status-good)" }}>{data.zone_counts.low}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Business-wide risk matrix</h2>
        <RiskGridChart grid={data.business_grid} likelihoodLabels={data.likelihood_labels} impactLabels={data.impact_labels} />
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Risk register</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Risk</th><th>Category</th><th>Evidence</th><th className="num">L × I</th><th>Zone</th><th>Response</th></tr>
            </thead>
            <tbody>
              {data.business_risks.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.id}</strong></td>
                  <td>{r.name}</td>
                  <td>{r.category}</td>
                  <td>{r.evidence}</td>
                  <td className="num">{r.score}<span className="risk-li">L{r.likelihood} · I{r.impact}</span></td>
                  <td><span className={`risk-zone-pill zone-${r.zone_cls}`}>{r.zone_label}</span></td>
                  <td><strong>{r.response}</strong> — {r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Top 5 clients — concentration &amp; credit risk matrix</h2>
        <p className="period-note">
          Impact = this client's share of total book premium. Likelihood = their own outstanding balance as a
          share of their own premium due — a live credit-risk signal, not a subjective guess.
        </p>
        <RiskGridChart grid={data.client_grid} likelihoodLabels={data.likelihood_labels} impactLabels={data.impact_labels} />
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Top 5 clients — detail</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Client</th><th>State</th><th className="num">Premium Due</th><th className="num">Share of Book</th>
                <th className="num">Balance O/S</th><th className="num">O/S Ratio</th><th className="num">Cancelled</th><th>Zone</th>
              </tr>
            </thead>
            <tbody>
              {data.client_risks.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.id}</strong></td>
                  <td><a href={`/clients/${c.client_id}`}>{c.name}</a></td>
                  <td>{c.state || "—"}</td>
                  <td className="num">{fmtMoneyShort(c.premium_due)}</td>
                  <td className="num">{fmtPct(c.premium_share)}</td>
                  <td className="num">{fmtMoneyShort(c.balance_os)}</td>
                  <td className="num">{fmtPct(c.os_ratio)}</td>
                  <td className="num">{c.n_cancelled}</td>
                  <td><span className={`risk-zone-pill zone-${c.zone_cls}`}>{c.zone_label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
