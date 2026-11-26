import { useState } from "react";
import { Link } from "react-router";
import { AppointmentsTab } from "../components/AppointmentsTab";
import { CeTab } from "../components/CeTab";
import { EoTab } from "../components/EoTab";
import { LicencesTab } from "../components/LicencesTab";
import { LoaTab } from "../components/LoaTab";
import { useRegistrySummary } from "../hooks/useHrApi";
import type { RegistrySummary } from "../lib/types";
import "../hr-admin.css";

const TABS = [
  { id: "licences", label: "Licences" },
  { id: "appointments", label: "Carrier appointments" },
  { id: "loa", label: "Lines of authority" },
  { id: "ce", label: "Continuing education" },
  { id: "eo", label: "E&O cover" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Strip({ title, tally }: { title: string; tally: RegistrySummary["licences"] }) {
  return (
    <div className="hr-stat">
      <h3>{title}</h3>
      <ul>
        <li className="hr-band hr-band-expired"><strong>{tally.expired}</strong> expired</li>
        <li className="hr-band hr-band-30"><strong>{tally[30]}</strong> ≤ 30 days</li>
        <li className="hr-band hr-band-60"><strong>{tally[60]}</strong> ≤ 60 days</li>
        <li className="hr-band hr-band-90"><strong>{tally[90]}</strong> ≤ 90 days</li>
        <li className="hr-band hr-band-ok"><strong>{tally.ok}</strong> current</li>
      </ul>
    </div>
  );
}

// The compliance registry: licences, carrier appointments, lines of authority, CE and E&O in one place, with
// a header showing what is about to lapse.
export function LicensingPage() {
  const [tab, setTab] = useState<TabId>("licences");
  const summary = useRegistrySummary();
  const s = summary.data;

  return (
    <div className="hr-page">
      <div className="page-header">
        <h1>Licensing &amp; E&amp;O registry</h1>
        <div className="page-header-actions">
          <Link className="btn-secondary btn-sm" to="/hr/licensing/import">Upload licences</Link>
        </div>
      </div>
      {s && (
        <>
          <div className="hr-stats">
            <Strip title="Licences" tally={s.licences} />
            <Strip title="Carrier appointments" tally={s.appointments} />
            <Strip title="E&O policies" tally={s.eoPolicies} />
          </div>
          {s.unlicensedProducers.length > 0 && (
            <div className="flash flash-error" role="alert">
              {s.unlicensedProducers.length} producer{s.unlicensedProducers.length === 1 ? " has" : "s have"} no in-force NAICOM licence today:{" "}
              {s.unlicensedProducers.slice(0, 8).map((p) => p.full_name).join(", ")}
              {s.unlicensedProducers.length > 8 ? "…" : ""}
            </div>
          )}
        </>
      )}
      <div className="hr-tabs" role="tablist" aria-label="Registry sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className={tab === t.id ? "is-active" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "licences" && <LicencesTab />}
        {tab === "appointments" && <AppointmentsTab />}
        {tab === "loa" && <LoaTab />}
        {tab === "ce" && <CeTab />}
        {tab === "eo" && <EoTab />}
      </div>
    </div>
  );
}
