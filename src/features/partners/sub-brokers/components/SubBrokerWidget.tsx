import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { useSubBrokerMeta } from "../lib/subBrokers";
import { Panel } from "@/shared/components/exec/Panel";

interface Widget {
  since: string;
  totalPayable: number;
  totalOutstanding: number;
  activeSubBrokers: number;
  pendingApprovals: number;
  ytdBrokerage: number;
  top: { id: number; reference: string; name: string; policies: number; premium: number; brokerage: number; grossShare: number }[];
}

// Dashboard panel for staff who may see sub-broker reports: this year's top
// sub-brokers and what is owed to them. Renders nothing for anyone else.
export function SubBrokerWidget() {
  const { can, meta } = useSubBrokerMeta();
  const allowed = can("subbroker.report");
  const { data } = useQuery({
    queryKey: ["sub-brokers", "widget"],
    queryFn: () => api.get<Widget>("/api/sub-brokers/reports/dashboard"),
    enabled: allowed,
    retry: false,
  });
  if (!meta || !allowed || !data || (data.activeSubBrokers === 0 && data.top.length === 0)) return null;
  return (
    <Panel eyebrow="Sub-Brokers" title="Top sub-brokers this year" actions={<Link className="exec-rowbtn" to="/sub-brokers/reports">Reports</Link>} flush>
      <div className="exec-metrics" role="group" aria-label="Sub-broker commission position">
        <div className="exec-metric"><div className="exec-metric-label">Payable now</div><div className="exec-metric-value is-warn" title={fmtMoney(data.totalPayable)}>{fmtMoneyShort(data.totalPayable)}</div></div>
        <div className="exec-metric"><div className="exec-metric-label">Outstanding</div><div className="exec-metric-value" title={fmtMoney(data.totalOutstanding)}>{fmtMoneyShort(data.totalOutstanding)}</div></div>
        <div className="exec-metric"><div className="exec-metric-label">Brokerage via sub-brokers</div><div className="exec-metric-value" title={fmtMoney(data.ytdBrokerage)}>{fmtMoneyShort(data.ytdBrokerage)}</div></div>
        <div className="exec-metric"><div className="exec-metric-label">Active</div><div className="exec-metric-value">{data.activeSubBrokers}</div>
          {data.pendingApprovals > 0 && <div className="exec-metric-note">{data.pendingApprovals} split change(s) awaiting approval</div>}</div>
      </div>
      <div className="exec-table-wrap">
        <table className="exec-table is-static exec-mini-table">
          <thead><tr><th scope="col">Sub-broker</th><th scope="col" className="num">Policies</th><th scope="col" className="num">Brokerage</th><th scope="col" className="num">Their share</th></tr></thead>
          <tbody>
            {data.top.length === 0 && <tr><td colSpan={4}>No business through sub-brokers yet this year.</td></tr>}
            {data.top.map((t) => (
              <tr key={t.reference}>
                <td className="wrap"><Link to={`/sub-brokers/${t.id}`}>{t.name}</Link><div className="exec-dl-note">{t.reference}</div></td>
                <td className="num">{t.policies}</td>
                <td className="num">{fmtMoneyShort(t.brokerage)}</td>
                <td className="num">{fmtMoneyShort(t.grossShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
