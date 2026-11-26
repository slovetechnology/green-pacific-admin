import { memo } from "react";
import { sequentialBlue } from "@/shared/lib/nigeriaStates";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { useAnalyticsStore } from "../store/analyticsStore";
import type { ClientHeatmap } from "../api/analytics";
import { AnalyticsCard } from "./AnalyticsCard";

// Revenue concentration: one row per top client, one column per top class, each cell shaded by premium.
// Dark rows and dark cells are where the book depends on a single account or a single product. Class
// headers are slicers like the product-mix donut.

// Cells past this shade are dark enough to need white text.
const DARK_FROM = 0.55;

interface Props {
  heatmap: ClientHeatmap | null | undefined;
  loading: boolean;
  stale: boolean;
}

export const ClientHeatmapWidget = memo(function ClientHeatmapWidget({ heatmap, loading, stale }: Props) {
  const picked = useAnalyticsStore((s) => s.filters.class);
  const toggle = useAnalyticsStore((s) => s.toggle);

  return (
    <AnalyticsCard eyebrow="Concentration" title="Revenue by client × class of business" loading={loading} stale={stale} empty={heatmap === null} emptyText="No premium in this period to build a heatmap from." flush height={320}>
      {heatmap && (
        <>
          <p className="exec-state hm-summary">
            Top {heatmap.clients.length} clients hold <strong>{heatmap.topShare}%</strong> of {fmtMoneyShort(heatmap.total)} premium.
          </p>
          <div className="exec-table-wrap">
            <table className="exec-table hm-table">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  {heatmap.classes.map((cls) => (
                    <th key={cls} scope="col" className="num">
                      <button type="button" className="exec-rowbtn" aria-pressed={picked === cls} title="Click to filter the page to this class" onClick={() => toggle("class", cls)}>
                        {cls}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="num">Total</th>
                  <th scope="col" className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.clients.map((client) => (
                  <tr key={client.id}>
                    <td className="wrap">{client.name}</td>
                    {client.cells.map((cell, i) => {
                      const frac = cell.pct / 100;
                      const label = `${client.name}, ${heatmap.classes[i]}: ${cell.value ? fmtMoney(cell.value) : "no premium"}`;
                      return (
                        <td key={i} className="num hm-cell" title={label} style={cell.value ? { background: sequentialBlue(frac), color: frac >= DARK_FROM ? "#fff" : "var(--text-primary)" } : undefined}>
                          <span className="sr-only">{label}</span>
                          <span aria-hidden="true">{cell.value ? fmtMoneyShort(cell.value) : "—"}</span>
                        </td>
                      );
                    })}
                    <td className="num">{fmtMoneyShort(client.premium)}</td>
                    <td className="num">{client.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hm-legend" aria-hidden="true">
            <span>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f} className="hm-swatch" style={{ background: sequentialBlue(f) }} />
            ))}
            <span>More premium</span>
          </div>
        </>
      )}
    </AnalyticsCard>
  );
});
