import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  records: { id: number; referenceNo: string; name: string }[];
  newClients: { id: number; name: string }[];
}

export function KycImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/kyc-import"
      title="Upload KYC"
      noun="records"
      backTo="/kyc-submissions"
      backLabel="Go to KYC Submissions"
      invalidate="kyc"
      intro={
        <>
          Fill in one row per customer, individual or company. Each row goes through the same checks as the KYC form:
          BVN, NIN, TIN and ID numbers are stored encrypted, an identity already on file is refused, and the risk level is
          worked out. For a company, give its RC number, registered address, <strong>Directors</strong> and
          <strong> Beneficial Owners</strong>. Every record arrives as <strong>Pending</strong>: review and verify each one
          as usual (a high-risk applicant needs an admin). ID documents and photos can't come from a spreadsheet; attach
          those through the KYC form if you need them.
        </>
      }
      summary={(r) => (
        <div>
          <div className="k">New clients</div>
          <div className="v"><span className="badge">{r.newClients.length} client{r.newClients.length !== 1 ? "s" : ""}</span></div>
        </div>
      )}
      details={(r) => (
        <>
          {r.newClients.length > 0 && (
            <div className="card">
              <h2>New clients added</h2>
              <ul>{r.newClients.map((c) => <li key={c.id}><Link to={`/clients/${c.id}`}>{c.name}</Link></li>)}</ul>
            </div>
          )}
          {r.records.length > 0 && (
            <div className="card">
              <h2>KYC records added</h2>
              <ul>
                {r.records.map((k) => <li key={k.id}><Link to={`/kyc-submissions/${k.id}`}>{k.referenceNo}</Link> · {k.name}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    />
  );
}
