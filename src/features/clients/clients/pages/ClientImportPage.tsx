import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  clients: { id: number; name: string; clientRef: string | null }[];
}

export function ClientImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/clients-import"
      title="Upload Clients"
      noun="clients"
      backTo="/clients"
      backLabel="Go to Clients"
      invalidate="clients"
      intro={
        <>
          Fill in one row per client. Only <strong>Client Name</strong> is required; each new client gets the next CUST
          number. A name already on the system is skipped and that client is left exactly as it is, so the upload never
          overwrites anyone. Fill in the <strong>Contact</strong> columns to add a contact person with the client.
          A <strong>Parent Client</strong> can be one already on the system or one higher up in the same sheet.
        </>
      }
      details={(r) =>
        r.clients.length > 0 && (
          <div className="card">
            <h2>Clients added</h2>
            <ul>
              {r.clients.map((c) => (
                <li key={c.id}><Link to={`/clients/${c.id}`}>{c.name}</Link>{c.clientRef ? ` · ${c.clientRef}` : ""}</li>
              ))}
            </ul>
          </div>
        )
      }
    />
  );
}
