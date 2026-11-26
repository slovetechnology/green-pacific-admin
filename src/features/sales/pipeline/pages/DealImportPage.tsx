import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  deals: { id: number; name: string; client: string; newProspect: boolean }[];
}

export function DealImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/deals-import"
      title="Upload Leads"
      noun="leads"
      backTo="/deals"
      backLabel="Go to Pipeline"
      invalidate="deals"
      intro={
        <>
          Fill in one row per lead: <strong>Client / Prospect Name</strong> and <strong>Class of Business</strong> are
          required. Each row becomes a New deal at the <strong>Lead</strong> stage, exactly as if added with “New deal”, and
          is then moved on the board as usual (KYC, quotes and so on). A name not on the system is added as a prospect;
          one that looks like a client you already have is refused and the likely matches are listed, so use the exact name.
          A client that already has an open deal for the same class is skipped. Renewal deals are created automatically
          from expiring policies, so they are not uploaded.
        </>
      }
      details={(r) =>
        r.deals.length > 0 && (
          <div className="card">
            <h2>Leads added</h2>
            <ul>
              {r.deals.map((d) => (
                <li key={d.id}><Link to={`/deals/${d.id}`}>{d.name}</Link>{d.newProspect ? " (new prospect)" : ""}</li>
              ))}
            </ul>
          </div>
        )
      }
    />
  );
}
