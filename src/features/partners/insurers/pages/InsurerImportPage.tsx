import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  insurers: { id: number; name: string; insurerRef: string | null }[];
}

export function InsurerImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/insurers-import"
      title="Upload Insurers"
      noun="insurers"
      backTo="/insurers"
      backLabel="Go to Insurers"
      invalidate="insurers"
      intro={
        <>
          Fill in one row per insurer. Only <strong>Insurer Name</strong> is required; each new insurer gets the next INS
          number. A name already on the system, or a NAICOM licence number another insurer already has, is skipped and
          that insurer is left exactly as it is, so the upload never overwrites anything. To update licence numbers and
          classes on insurers you already have, use <strong>Load insurer directory</strong> instead.
        </>
      }
      details={(r) =>
        r.insurers.length > 0 && (
          <div className="card">
            <h2>Insurers added</h2>
            <ul>
              {r.insurers.map((i) => (
                <li key={i.id}><Link to={`/insurers/${i.id}`}>{i.name}</Link>{i.insurerRef ? ` · ${i.insurerRef}` : ""}</li>
              ))}
            </ul>
          </div>
        )
      }
    />
  );
}
