import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  producers: { id: number; name: string }[];
}

export function ProducerImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/producers-import"
      title="Upload Producers"
      noun="producers"
      backTo="/producers"
      backLabel="Go to Producers"
      invalidate="producers"
      intro={
        <>
          Fill in one row per producer. Only <strong>Producer Name</strong> is required. Spell it exactly as it appears in
          the Producer field on policies, because producer payables and performance are matched by that name. A name already
          on the system is skipped and that producer is left as it is. <strong>Login</strong> links the producer to a staff
          login, and <strong>Reports To</strong> sets their team lead, who can be added higher up in the same sheet.
        </>
      }
      details={(r) =>
        r.producers.length > 0 && (
          <div className="card">
            <h2>Producers added</h2>
            <ul>
              {r.producers.map((p) => <li key={p.id}><Link to={`/producers/${p.id}`}>{p.name}</Link></li>)}
            </ul>
          </div>
        )
      }
    />
  );
}
