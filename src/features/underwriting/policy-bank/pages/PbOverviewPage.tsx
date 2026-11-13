import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { pb, qs, usePbAccess, type Paged, type PbClass, type PbComponent, type PbProduct } from "../api/policyBank";
import { PbLayout } from "../components/PbCommon";

const count = async (query: Record<string, string>) => (await pb.get<Paged<PbComponent>>(`/components${qs({ ...query, perPage: 1 })}`)).total;

export function PbOverviewPage() {
  const { can } = usePbAccess();
  const classes = useQuery({ queryKey: ["pb", "classes"], queryFn: () => pb.get<{ classes: PbClass[] }>("/classes") });
  const products = useQuery({ queryKey: ["pb", "products", "all"], queryFn: () => pb.get<Paged<PbProduct>>(`/products${qs({ perPage: 200 })}`) });
  const stats = useQuery({
    queryKey: ["pb", "overview-counts"],
    queryFn: async () => ({
      all: await count({}),
      approved: await count({ approval: "Approved" }),
      drafts: await count({ approval: "Draft" }),
      submitted: (await count({ approval: "Submitted" })) + (await count({ approval: "UnderReview" })),
    }),
  });

  const versions = (products.data?.rows ?? []).flatMap((p) => p.versions.map((v) => ({ ...v, product: p })));
  const byStatus = (s: string) => versions.filter((v) => v.approval_status === s).length;
  const live = versions.filter((v) => v.approval_status === "Approved");

  return (
    <PbLayout
      title="Policy Bank"
      intro="The source of truth for policy wording. Every wording is versioned and approved by someone other than its author; an approved version is never edited, only replaced by a new one."
    >
      <div className="pb-grid">
        <div className="pb-stat"><strong>{classes.data?.classes.length ?? "…"}</strong><span>Classes of business</span></div>
        <div className="pb-stat"><strong>{products.data?.total ?? "…"}</strong><span>Products</span></div>
        <div className="pb-stat"><strong>{stats.data?.all ?? "…"}</strong><span>Wording components</span></div>
        <div className="pb-stat"><strong>{stats.data?.approved ?? "…"}</strong><span>With an approved version</span></div>
        <div className="pb-stat"><strong>{stats.data?.drafts ?? "…"}</strong><span>With a draft version</span></div>
        <div className="pb-stat">
          <strong>{stats.data?.submitted ?? "…"}</strong>
          <span>Waiting for approval{can("policy_wording.approve") && <> · <Link to="/policy-bank/approvals">review</Link></>}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Product versions</h2>
        <p className="pb-muted">
          {live.length} approved · {byStatus("Draft")} draft · {byStatus("Submitted") + byStatus("UnderReview")} awaiting approval
        </p>
        <div className="pb-table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Version</th><th>Status</th><th>Effective from</th></tr></thead>
            <tbody>
              {versions.length === 0 && <tr><td colSpan={4} className="pb-muted">No product versions yet.</td></tr>}
              {versions.map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/policy-bank/product-versions/${v.id}`}>{v.product.name}</Link></td>
                  <td>{v.version}</td>
                  <td>{v.approval_status}</td>
                  <td>{v.effective_from ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="pb-muted" style={{ marginTop: "1rem" }}>
        Seeded wording is generic broker specimen text. It needs insurer and legal review before it is used on a live placement.
      </p>
    </PbLayout>
  );
}
