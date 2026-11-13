import { COMPANY } from "@/shared/lib/company";

// Company name and contact details for page footers and sign-in screens.
export function CompanyContact({ showName = true }: { showName?: boolean }) {
  return (
    <address className="company-contact">
      {showName && <strong>{COMPANY.name}</strong>}
      <span>{COMPANY.address}</span>
      <span>
        Mobile:{" "}
        {COMPANY.mobiles.map((m, i) => (
          <span key={m}>
            {i > 0 && ", "}
            <a href={`tel:${m}`}>{m}</a>
          </span>
        ))}
      </span>
      <span>
        Email: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </span>
    </address>
  );
}
