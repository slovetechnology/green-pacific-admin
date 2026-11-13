import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  contacts: { id: number; name: string; clientId: number; client: string }[];
}

export function ContactImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/contacts-import"
      title="Upload Client Contacts"
      noun="contacts"
      backTo="/clients"
      backLabel="Go to Clients"
      invalidate="clients"
      intro={
        <>
          Fill in one row per contact person. <strong>Client Name</strong> must be a client already on the system (add new
          clients with <Link to="/clients/import">Upload clients</Link> first) and <strong>Contact Name</strong> is required.
          A contact the client already has (same name or same email) is skipped, so uploading a sheet twice adds nothing.
        </>
      }
      details={(r) =>
        r.contacts.length > 0 && (
          <div className="card">
            <h2>Contacts added</h2>
            <ul>
              {r.contacts.map((c) => <li key={c.id}>{c.name} · <Link to={`/clients/${c.clientId}`}>{c.client}</Link></li>)}
            </ul>
          </div>
        )
      }
    />
  );
}
