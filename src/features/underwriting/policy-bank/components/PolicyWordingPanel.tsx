import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { engine } from "../api/engine";
import { usePbAccess } from "../api/policyBank";
import { PbStatus } from "./PbCommon";

/** The policy wording work on one transaction: drafts and submitted policies, and the way into the builder. */
export function PolicyWordingPanel({ transactionId }: { transactionId: number }) {
  const { can } = usePbAccess();
  const canBuild = can("policy_wording.generate");
  const drafts = useQuery({ queryKey: ["pb", "pe-drafts", "tx", transactionId], queryFn: () => engine.drafts(`?transactionId=${transactionId}&perPage=50`), enabled: canBuild });
  const rows = drafts.data?.rows ?? [];
  return (
    <div className="card">
      <div className="page-header">
        <h2>Policy wording</h2>
        {canBuild && <Link className="btn" to={`/policy-bank/builder/new?transactionId=${transactionId}`}>{rows.length ? "Start another" : "Build policy wording"}</Link>}
      </div>
      {!canBuild && <p className="pb-muted">You need the policy wording generate permission to build or see policy wording. Ask an administrator for the Policy issuer role.</p>}
      {canBuild && drafts.isLoading && <p>Loading…</p>}
      {canBuild && !drafts.isLoading && rows.length === 0 && (
        <p className="pb-muted">No policy wording has been built for this policy yet. The client, insurer, risk and premium come from this transaction; you choose the product and the cover.</p>
      )}
      {rows.length > 0 && (
        <div className="pb-table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Status</th><th>Started by</th><th>Last changed</th><th /></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.product_name} v{d.product_version}</td>
                  <td><PbStatus status={d.status} /></td>
                  <td>{d.created_by}</td>
                  <td>{d.updated_at?.slice(0, 16).replace("T", " ")}</td>
                  <td><Link className="btn-secondary btn" to={`/policy-bank/builder/${d.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
