import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  licences: { id: number; person: string; licenceType: string; licenceNo: string }[];
}

export function LicenceImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/licences-import"
      title="Upload Staff Licences"
      noun="licences"
      backTo="/hr/licensing"
      backLabel="Go to Licensing"
      invalidate="hr"
      intro={
        <>
          Fill in one row per licence or membership. Identify the person by <strong>Staff No</strong> (or their
          <strong> Full Name</strong> if it is unique), and give the <strong>Licence Type</strong> and <strong>Licence No</strong>.
          Each row goes through the same checks as adding a licence by hand, and a licence the person already has on file is
          skipped. The <strong>Expires On</strong> date drives the 90, 60 and 30-day expiry alerts. Once the registry is loaded,
          the producer licence, appointment and E&amp;O compliance rules can be switched on without flagging every policy.
        </>
      }
      details={(r) =>
        r.licences.length > 0 && (
          <div className="card">
            <h2>Licences added</h2>
            <ul>{r.licences.map((l) => <li key={l.id}>{l.person} · {l.licenceType} {l.licenceNo}</li>)}</ul>
          </div>
        )
      }
    />
  );
}
