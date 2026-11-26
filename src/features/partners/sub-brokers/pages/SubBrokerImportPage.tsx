import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  subBrokers: { id: number; name: string; referenceNo: string }[];
}

export function SubBrokerImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/sub-brokers-import"
      title="Upload Sub-brokers"
      noun="sub-brokers"
      backTo="/sub-brokers"
      backLabel="Go to Sub-brokers"
      invalidate="sub-brokers"
      intro={
        <>
          Fill in one row per sub-broker. <strong>Name</strong> and <strong>Default Split %</strong> (their agreed share of our
          brokerage) are required. Each row goes through the same checks as the register form: a Corporate sub-broker needs an
          RC number, bank name, account name and a 10-digit account number go together, and an email, phone or TIN already
          used by another sub-broker is refused. The splits are recorded as agreed at onboarding, from the
          <strong> Onboarded On</strong> date. A name already registered is skipped and left as it is.
        </>
      }
      details={(r) =>
        r.subBrokers.length > 0 && (
          <div className="card">
            <h2>Sub-brokers registered</h2>
            <ul>
              {r.subBrokers.map((s) => <li key={s.id}><Link to={`/sub-brokers/${s.id}`}>{s.name}</Link> · {s.referenceNo}</li>)}
            </ul>
          </div>
        )
      }
    />
  );
}
