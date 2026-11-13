import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, qs, TYPE_LABEL, type Paged, type PbProduct, type WordingSource } from "../api/policyBank";
import type { WordDiff } from "../api/engine";
import { Flash, PbLayout, useAct } from "../components/PbCommon";
import { WordDiffView } from "../components/PolicyChanges";
import { useInsurerOptions } from "./PbWordingDetailPage";

interface Cell { present: boolean; version?: string; source?: WordingSource; differsFromMaster?: boolean; text?: string; diff?: WordDiff[] | null }
interface Row { code: string; name: string; type: string; kind?: string; status: "same" | "differs" | "missing_in_some"; cells: Record<string, Cell> }
interface Findings { summary: Record<string, number>; total: number; [k: string]: unknown }
interface Result {
  product: { name: string }; productVersion: { version: string; approval_status: string }; asOf: string; precedence: string[];
  columns: { key: string; label: string; mode: string; wordings: number; limits: number; productVersion: string | null }[];
  rows: Row[]; limitRows: Row[]; findings: Record<string, Findings>;
}

const FINDING_LABEL: Record<string, string> = {
  additionalExclusions: "additional exclusions", missingExclusions: "exclusions missing", differentExclusions: "exclusions worded differently",
  missingCoverages: "coverages missing", additionalCoverages: "additional coverages", missingExtensions: "extensions missing", additionalExtensions: "additional extensions",
  additionalWarranties: "additional warranties", missingWarranties: "warranties missing", differentWarranties: "warranties worded differently",
  additionalConditions: "additional conditions", missingConditions: "conditions missing", differentConditions: "conditions worded differently",
  differentWording: "other wording differences", differentLimits: "different limits", differentSublimits: "different sub-limits", differentExcesses: "different excesses",
};

export function PbComparePage() {
  const insurers = useInsurerOptions();
  const products = useQuery({ queryKey: ["pb", "products", "compare"], queryFn: () => pb.get<Paged<PbProduct>>(`/products${qs({ perPage: 200 })}`) });
  const [pvId, setPvId] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const run = useAct(() => pb.post<Result>("/compare", { productVersionId: Number(pvId), insurerIds: picked }), () => "");
  const out = run.data;

  const versions = (products.data?.rows ?? []).flatMap((p) => p.versions.filter((v) => v.insurer_id === null && ["Approved", "Superseded"].includes(v.approval_status)).map((v) => ({ id: v.id, label: `${p.name} v${v.version} (${v.approval_status})` })));
  const toggle = (id: number) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 4 ? [...cur, id] : cur));
  const visible = (rows: Row[]) => (onlyDiff ? rows.filter((r) => r.status !== "same") : rows);

  return (
    <PbLayout title="Compare insurers" intro="Line up the broker's master wording against each insurer's, and see what each insurer adds, leaves out or words differently. Read-only: nothing here changes any wording.">
      <div className="card">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-pv">Product version (the broker master)</label>
            <select id="cmp-pv" className="form-control" value={pvId} onChange={(e) => setPvId(e.target.value)}>
              <option value="">Choose…</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <fieldset className="pb-fieldset">
          <legend>Insurers to compare (up to 4)</legend>
          <div className="pb-chips">
            {(insurers.data?.insurers ?? []).map((i) => (
              <label key={i.id} className={`pb-chip${picked.includes(i.id) ? " on" : ""}`}>
                <input type="checkbox" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} /> {i.name}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="btn" disabled={!pvId || picked.length === 0 || run.isPending} onClick={() => run.mutate(undefined)}>{run.isPending ? "Comparing…" : "Compare"}</button>
        <Flash error={run.error} />
      </div>

      {out && (
        <>
          <p className="pb-muted">
            {out.product.name} v{out.productVersion.version} ({out.productVersion.approval_status}) · wording in force on {out.asOf} · insurer wording ranked: {out.precedence.map((s) => s.replace("_", " ")).join(" > ")}
          </p>
          <div className="pb-grid">
            {out.columns.slice(1).map((c) => {
              const f = out.findings[c.key];
              const items = Object.entries(f.summary).filter(([, n]) => n > 0);
              return (
                <div className="pb-stat" key={c.key}>
                  <strong>{f.total}</strong>
                  <span>{c.label}: differences from the master</span>
                  <div className="pb-muted" style={{ fontSize: "0.78rem", marginTop: "0.3rem" }}>{c.mode}{c.productVersion ? ` · ${c.productVersion}` : ""}</div>
                  <ul className="pb-list" style={{ marginTop: "0.4rem", fontSize: "0.82rem" }}>
                    {items.length === 0 && <li>None: the same as the master.</li>}
                    {items.map(([k, n]) => <li key={k}>{n} {FINDING_LABEL[k] ?? k}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>

          <label className="pb-muted"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Show only what differs</label>
          <div className="card pb-table-wrap">
            <h3 className="card-title">Wordings</h3>
            <table className="pb-matrix">
              <thead><tr><th>Wording</th><th>Type</th>{out.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {visible(out.rows).length === 0 && <tr><td colSpan={out.columns.length + 2} className="pb-muted">No differences in the wordings.</td></tr>}
                {visible(out.rows).map((r) => (
                  <Fragment key={r.code}>
                    <tr className={`pb-row-${r.status}`}>
                      <td><strong>{r.name}</strong><div className="pb-code pb-muted">{r.code}</div></td>
                      <td>{TYPE_LABEL[r.type] ?? r.type}</td>
                      {out.columns.map((c) => {
                        const cell = r.cells[c.key];
                        return (
                          <td key={c.key}>
                            {!cell.present ? <span className="pb-missing">Not offered</span> : (
                              <>
                                v{cell.version}{cell.source && cell.source !== "broker_master" ? <span className="pb-muted"> · {cell.source.replace("_", " ")}</span> : null}
                                {cell.differsFromMaster && <> <button type="button" className="pb-link" onClick={() => setOpen(open === `${r.code}|${c.key}` ? null : `${r.code}|${c.key}`)}>worded differently</button></>}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {out.columns.map((c) => open === `${r.code}|${c.key}` && r.cells[c.key].diff && (
                      <tr key={`${r.code}-${c.key}`}><td colSpan={out.columns.length + 2}><strong>{r.name}: {c.label} compared with the master</strong><WordDiffView parts={r.cells[c.key].diff!} /></td></tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card pb-table-wrap">
            <h3 className="card-title">Limits, sub-limits and excesses</h3>
            <table className="pb-matrix">
              <thead><tr><th>Item</th><th>Kind</th>{out.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {visible(out.limitRows).length === 0 && <tr><td colSpan={out.columns.length + 2} className="pb-muted">No differences in the limits.</td></tr>}
                {visible(out.limitRows).map((r) => (
                  <tr key={r.code} className={`pb-row-${r.status}`}>
                    <td><strong>{r.name}</strong></td><td>{r.kind?.replace("_", "-")}</td>
                    {out.columns.map((c) => <td key={c.key}>{r.cells[c.key].present ? <span className={r.cells[c.key].differsFromMaster ? "pb-diff-cell" : undefined}>{r.cells[c.key].text}</span> : <span className="pb-missing">Not offered</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PbLayout>
  );
}
