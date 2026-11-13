import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  claims: { id: number; claimNo: string; client: string; newClient: boolean }[];
  newClients: { id: number; name: string }[];
}

const muted = { color: "var(--text-muted)", fontSize: "0.85rem" } as const;

export function ClaimImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/claims-import"
      title="Upload Claims"
      noun="claims"
      backTo="/claims"
      backLabel="Go to Claims"
      invalidate="claims"
      intro={
        <>
          Fill in one row per claim. Only <strong>Client Name</strong> is required. A name already on the system uses that
          client; a name that isn't is added as a new client, with the Client Address, City and State columns if you fill
          them in. Give a <strong>Policy No</strong> to link the claim to an existing client's policy. Leave <strong>Claim No</strong> blank
          to get the next CLM number, or enter the number an older claim already has. Dates are best as <strong>YYYY-MM-DD</strong>;
          DD/MM/YYYY is also read.
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
              <p style={muted}>
                These names were not on the system, so each was added as a client. If one is a misspelling of an existing
                client, delete that claim (a claim's client can't be changed), correct the name in your sheet and upload the row again.
              </p>
              <ul>
                {r.newClients.map((c) => <li key={c.id}><Link to={`/clients/${c.id}`}>{c.name}</Link></li>)}
              </ul>
            </div>
          )}
          {r.claims.length > 0 && (
            <div className="card">
              <h2>Claims imported</h2>
              <ul>
                {r.claims.map((c) => (
                  <li key={c.id}><Link to={`/claims/${c.id}`}>{c.claimNo}</Link> · {c.client}{c.newClient ? " (new client)" : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    />
  );
}
