import { memo, useEffect, useState } from "react";
import { STATE_PATH_IDS, sequentialBlue } from "@/shared/lib/nigeriaStates";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { useAnalyticsStore } from "../store/analyticsStore";
import type { Geography } from "../api/analytics";
import { AnalyticsCard } from "./AnalyticsCard";

// Where the book sits. Both widgets read the `geography` slice of the dashboard payload: the map shades
// states by premium and follows every filter; the matrix crosses the biggest classes with the biggest
// states and its class labels are slicers like the product-mix donut.

interface CountryPath {
  id: string;
  d: string;
}

// The blank map is a static asset (public/nigeria_map.svg). Fetch it once and keep each state's outline.
let cachedPaths: CountryPath[] | null = null;
async function loadCountryPaths(): Promise<CountryPath[]> {
  if (cachedPaths) return cachedPaths;
  const res = await fetch("/nigeria_map.svg");
  const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const paths: CountryPath[] = [];
  doc.querySelectorAll("path.country").forEach((el) => {
    const id = el.getAttribute("id") || "";
    const d = el.getAttribute("d") || "";
    if (d) paths.push({ id: id.split(".").pop() || id, d });
  });
  cachedPaths = paths;
  return paths;
}

const ID_TO_STATE = Object.fromEntries(Object.entries(STATE_PATH_IDS).map(([state, id]) => [id, state]));

interface Common {
  loading: boolean;
  stale: boolean;
}

export const StateMapWidget = memo(function StateMapWidget({ geography, loading, stale }: Common & { geography: Geography | undefined }) {
  const [paths, setPaths] = useState<CountryPath[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadCountryPaths().then((p) => !cancelled && setPaths(p)).catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const states = geography?.states ?? [];
  const byState = Object.fromEntries(states.map((s) => [s.state, s]));
  const maxPremium = Math.max(0, ...states.filter((s) => s.mapped).map((s) => s.premium));
  const offMap = states.filter((s) => !s.mapped);
  const offMapPolicies = offMap.reduce((n, s) => n + s.policies, 0) + (geography?.unplaced.policies ?? 0);

  return (
    <AnalyticsCard eyebrow="Geography" title="Premium by state" loading={loading || (!paths && !failed)} stale={stale} empty={!!geography && states.length === 0} emptyText="No premium with a client state in this period." height={300}>
      <div className="map-row">
        {paths && (
          <svg className="nigeria-map" viewBox="0 0 954 734" role="img" aria-label="Map of Nigeria shaded by premium written in each state">
            {paths.map((p) => {
              const name = ID_TO_STATE[p.id];
              const datum = name ? byState[name] : undefined;
              const fill = datum && maxPremium > 0 ? sequentialBlue(datum.premium / maxPremium) : "var(--gridline)";
              const title = datum ? `${name}: ${datum.policies} polic${datum.policies === 1 ? "y" : "ies"}, ${fmtMoney(datum.premium)}` : name ? `${name}: no premium in this view` : undefined;
              return (
                <path key={p.id} className="map-state" d={p.d} fill={fill} stroke="var(--surface-1)" strokeWidth={0.6}>
                  {title && <title>{title}</title>}
                </path>
              );
            })}
          </svg>
        )}
        <div className="map-legend">
          {states.map((s) => (
            <div className="donut-legend-item" key={s.state}>
              <span className="name">
                <span className="swatch" style={{ background: s.mapped && maxPremium ? sequentialBlue(s.premium / maxPremium) : "var(--gridline)" }} />
                {s.state}
              </span>
              <span className="val">
                {fmtMoneyShort(s.premium)} <span className="pct">· {s.policies}</span>
              </span>
            </div>
          ))}
          {offMapPolicies > 0 && (
            <p className="exec-state">
              {offMap.length > 0 && `${offMap.map((s) => s.state).join(", ")} ${offMap.length === 1 ? "is" : "are"} not drawn on the map. `}
              {geography && geography.unplaced.policies > 0 && `${geography.unplaced.policies} polic${geography.unplaced.policies === 1 ? "y has" : "ies have"} no client state.`}
            </p>
          )}
        </div>
      </div>
    </AnalyticsCard>
  );
});

export const ConcentrationWidget = memo(function ConcentrationWidget({ geography, loading, stale }: Common & { geography: Geography | undefined }) {
  const picked = useAnalyticsStore((s) => s.filters.class);
  const toggle = useAnalyticsStore((s) => s.toggle);
  const matrix = geography?.matrix ?? null;
  return (
    <AnalyticsCard eyebrow="Concentration" title="Class of business × top states" loading={loading} stale={stale} empty={!!geography && !matrix} emptyText="Not enough data to build a matrix for these filters." flush height={260}>
      {matrix && (
        <div className="exec-table-wrap">
          <table className="exec-table an-matrix">
            <thead>
              <tr>
                <th scope="col">Class of business</th>
                {matrix.colLabels.map((label) => (
                  <th key={label} scope="col" className="num">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.label} className={picked === row.label ? "is-selected" : undefined}>
                  <td className="wrap">
                    <button type="button" className="exec-rowbtn" aria-pressed={picked === row.label} title="Click to filter the page to this class" onClick={() => toggle("class", row.label)}>
                      {row.label}
                    </button>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="num">
                      <div className="bar-row" style={{ gridTemplateColumns: "1fr 64px" }}>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${cell.pct}%` }} />
                        </div>
                        <span className="bar-value">{cell.value ? fmtMoneyShort(cell.value) : "—"}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AnalyticsCard>
  );
});
