import { useMyFile } from "../hooks/useHrApi";
import { ExpiryBadge } from "../components/Badges";
import { money, pct } from "../components/Fields";
import "../hr-admin.css";

// A person's own licensing, appointments, E&O cover, CE progress, equipment and pay profile. The API picks the
// person from their login, so this page can never show anyone else's file.
export function MyCompliancePage() {
  const { data, isLoading } = useMyFile();
  if (isLoading) return <div className="card">Loading…</div>;
  const p = data?.profile;
  if (!p) {
    return (
      <div className="hr-page">
        <div className="page-header"><h1>My compliance file</h1></div>
        <div className="card">You don't have a staff record yet, so there is nothing to show. Ask HR to link your login to your employee record.</div>
      </div>
    );
  }
  const ok = p.status.licensed && Boolean(p.status.eoCover);

  return (
    <div className="hr-page">
      <div className="page-header"><h1>My compliance file</h1></div>
      <div className={`flash ${ok ? "flash-success" : "flash-error"}`} role="status">
        {ok
          ? "You are licensed and covered by E&O today."
          : [!p.status.licensed && "You have no in-force NAICOM licence.", !p.status.eoCover && "No E&O cover is in force for you."].filter(Boolean).join(" ")}
      </div>

      <div className="card">
        <h2>Licences</h2>
        <SimpleTable
          head={["Licence", "Number", "Status", "Expiry"]}
          rows={p.licences.map((l) => [l.licence_type, l.licence_no, l.status, <ExpiryBadge key="b" band={l.band} date={l.expires_on} />])}
          empty="No licences on file."
        />
        {p.loa.length > 0 && <p className="hr-hint">Lines of authority: {p.loa.filter((l) => l.status === "Active").map((l) => l.loa_name).join(", ") || "none active"}.</p>}
      </div>

      <div className="card">
        <h2>Carrier appointments</h2>
        <SimpleTable
          head={["Carrier", "Agency code", "Status", "Expiry"]}
          rows={p.appointments.map((a) => [a.insurer_name, a.agency_code ?? "—", a.status, <ExpiryBadge key="b" band={a.band} date={a.expires_on} />])}
          empty="No appointments on file."
        />
      </div>

      <div className="card">
        <h2>E&amp;O cover</h2>
        <SimpleTable
          head={["Cover", "Policy", "Per claim", "Retro date", "Expiry"]}
          rows={p.eoPolicies.map((e) => [e.scope === "Firm" ? "Firm-wide" : "Yours", e.policy_no, money(e.limit_per_claim), e.retroactive_date ?? "—", <ExpiryBadge key="b" band={e.band} date={e.expires_on} />])}
          empty="No E&O policies on file."
        />
      </div>

      {p.ce && (
        <div className="card">
          <h2>Continuing education — {p.ce.cycle.name}</h2>
          {p.ce.progress ? (
            <>
              <progress max={p.ce.cycle.required_hours} value={Math.min(p.ce.progress.completed, p.ce.cycle.required_hours)} aria-label="CE hours completed" />
              <p>
                {p.ce.progress.completed}h of {p.ce.cycle.required_hours}h completed
                {p.ce.progress.shortfall > 0 ? `, ${p.ce.progress.shortfall}h to go before ${p.ce.cycle.ends_on}.` : ". Requirement met."}
              </p>
            </>
          ) : (
            <p>CE doesn't apply to you in this cycle.</p>
          )}
        </div>
      )}

      {p.assets.length > 0 && (
        <div className="card">
          <h2>Equipment I hold</h2>
          <SimpleTable head={["Tag", "Item", "Serial", "Since"]} rows={p.assets.map((a) => [a.asset_tag, [a.make, a.model].filter(Boolean).join(" ") || a.category, a.serial_no ?? "—", (a as unknown as { assigned_on: string }).assigned_on])} empty="" />
        </div>
      )}

      {p.comp && (
        <div className="card">
          <h2>Pay profile</h2>
          <p>
            <strong>{p.comp.profile?.name}</strong> since {p.comp.effective_from}. Base salary {money(p.comp.base_salary_annual)} a year; commission {pct(p.comp.profile?.base_commission_rate ?? 0)}
            {p.comp.profile && p.comp.profile.peer_override_rate > 0 ? `, peer override ${pct(p.comp.profile.peer_override_rate)}` : ""}.
          </p>
          {p.comp.rules && p.comp.rules.length > 0 && (
            <SimpleTable
              head={["Carrier", "Basis", "Period", "Above", "Bonus"]}
              rows={p.comp.rules.map((r) => [r.insurer_id ? `Carrier #${r.insurer_id}` : "All carriers", r.basis, r.period, r.basis === "Policy count" ? String(r.threshold) : money(r.threshold), r.bonus_rate ? pct(r.bonus_rate) : money(r.bonus_amount)])}
              empty=""
            />
          )}
        </div>
      )}
    </div>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="exec-table-wrap table-wrap">
      <table className="exec-table is-static hr-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="empty-state">{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
