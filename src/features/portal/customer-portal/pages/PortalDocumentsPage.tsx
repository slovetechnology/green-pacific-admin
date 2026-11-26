import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";

interface Doc {
  id: number;
  doc_type: string;
  title: string | null;
  uploaded_at: string;
}

interface Receipt {
  id: number;
  policy_no: string | null;
  receipt_no: string;
  date_of_payment: string | null;
  premium_paid: number;
}

export function PortalDocumentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "documents"],
    queryFn: () => api.get<{ documents: Doc[]; receipts: Receipt[] }>("/api/portal/documents"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>Documents</h1>
        </div>
      </div>

      <div className="card">
        <h2>Policy Documents</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4}>Loading…</td>
                </tr>
              )}
              {!isLoading && data?.documents.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">No documents on file yet.</td>
                </tr>
              )}
              {data?.documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.doc_type}</td>
                  <td>{d.title || "—"}</td>
                  <td>{(d.uploaded_at || "").slice(0, 10)}</td>
                  <td>
                    <a className="btn-secondary btn-sm" href={apiUrl(`/api/portal/documents/${d.id}/file`)} target="_blank" rel="noreferrer">
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Receipts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Policy No</th>
                <th>Receipt No</th>
                <th className="num">Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && data?.receipts.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">No receipts yet.</td>
                </tr>
              )}
              {data?.receipts.map((r) => (
                <tr key={r.id}>
                  <td>{r.policy_no || "—"}</td>
                  <td>{r.receipt_no}</td>
                  <td className="num">{fmtMoney(r.premium_paid)}</td>
                  <td>{r.date_of_payment || "—"}</td>
                  <td>
                    <a
                      className="btn-secondary btn-sm"
                      href={apiUrl(`/api/portal/documents/receipt/${r.id}`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
