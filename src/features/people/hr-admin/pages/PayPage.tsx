import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Notice } from "../components/Badges";
import { SelectField, TextField, money, pct, today } from "../components/Fields";
import { useHrAccess } from "../context/HrAccessContext";
import { useAction, useHrMeta } from "../hooks/useHrApi";
import type { CompAssignment, CompProfile } from "../lib/types";
import "../hr-admin.css";

interface ProfilesResponse {
  profiles: CompProfile[];
  bases: string[];
  periods: string[];
  insurers: { id: number; name: string }[];
}

const blankProfile = { code: "", name: "", base_commission_rate: "", peer_override_rate: "", notes: "" };
const blankRule = { insurer_id: "", basis: "GWP", period: "Quarterly", threshold: "", bonus_rate: "", bonus_amount: "" };

// Commission and bonus tiers. Rates are typed as percentages and sent as fractions. HR edits; the MD can read.
export function PayPage() {
  const access = useHrAccess();
  const data = useQuery({ queryKey: ["hr", "comp-profiles"], queryFn: () => api.get<ProfilesResponse>("/api/hr-admin/comp/profiles") });
  const meta = useHrMeta(access.manageCompliance);
  const people = useQuery({
    queryKey: ["hr", "pay-people"],
    queryFn: () => api.get<{ employees: { id: number; staff_no: string; full_name: string }[] }>("/api/hr-admin/assets/meta"),
    enabled: access.managePay,
  });
  const { run, notice, busy } = useAction();
  const [profile, setProfile] = useState<typeof blankProfile | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [ruleFor, setRuleFor] = useState<number | null>(null);
  const [rule, setRule] = useState(blankRule);
  const [assign, setAssign] = useState({ employee_id: "", profile_id: "", base_salary_annual: "", effective_from: today(), reason: "" });
  const [viewing, setViewing] = useState("");
  const history = useQuery({
    queryKey: ["hr", "comp-history", viewing],
    queryFn: () => api.get<{ history: CompAssignment[] }>(`/api/hr-admin/comp/employees/${viewing}`),
    enabled: Boolean(viewing),
  });
  const profiles = data.data?.profiles ?? [];
  const employees = people.data?.employees ?? meta.data?.employees ?? [];
  const fraction = (percent: string) => (percent === "" ? "" : String(Number(percent) / 100));

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const body = { ...profile, base_commission_rate: fraction(profile.base_commission_rate), peer_override_rate: fraction(profile.peer_override_rate) };
    const ok = await run(() => (profileId ? api.put(`/api/hr-admin/comp/profiles/${profileId}`, body) : api.post("/api/hr-admin/comp/profiles", body)), "Profile saved.");
    if (ok !== undefined) { setProfile(null); setProfileId(null); }
  }
  async function saveRule(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post("/api/hr-admin/comp/bonus-rules", { ...rule, profile_id: ruleFor, bonus_rate: fraction(rule.bonus_rate) }), "Bonus rule added.");
    if (ok !== undefined) { setRuleFor(null); setRule(blankRule); }
  }
  async function assignProfile(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post("/api/hr-admin/comp/assign", assign), "Pay profile assigned.");
    if (ok !== undefined) setAssign({ ...assign, employee_id: "", base_salary_annual: "", reason: "" });
  }

  return (
    <div className="hr-page">
      <div className="page-header"><h1>Commission &amp; bonus tiers</h1></div>
      <Notice notice={notice} />
      {!access.managePay && <p className="hr-hint">You can read pay profiles but not change them.</p>}

      <div className="card">
        <div className="hr-toolbar">
          <h2 style={{ margin: 0 }}>Profiles</h2>
          {access.managePay && <button type="button" className="btn btn-sm" onClick={() => { setProfileId(null); setProfile(blankProfile); }}>New profile</button>}
        </div>
        {profile && (
          <form className="hr-form" onSubmit={saveProfile}>
            <div className="form-grid">
              <TextField label="Code" required value={profile.code} onChange={(v) => setProfile({ ...profile, code: v })} />
              <TextField label="Name" required value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} />
              <TextField label="Base commission (%)" type="number" step="any" required value={profile.base_commission_rate} onChange={(v) => setProfile({ ...profile, base_commission_rate: v })} hint="Share of brokerage earned on written business." />
              <TextField label="Peer override (%)" type="number" step="any" value={profile.peer_override_rate} onChange={(v) => setProfile({ ...profile, peer_override_rate: v })} hint="Share earned on a team member's business." />
              <TextField label="Notes" value={profile.notes} onChange={(v) => setProfile({ ...profile, notes: v })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>Save profile</button>
              <button type="button" className="btn-secondary btn" onClick={() => setProfile(null)}>Cancel</button>
            </div>
          </form>
        )}
        <div className="exec-table-wrap table-wrap">
          <table className="exec-table is-static hr-table">
            <thead><tr><th>Profile</th><th className="num">Commission</th><th className="num">Peer override</th><th>Carrier bonuses</th><th /></tr></thead>
            <tbody>
              {profiles.length === 0 && <tr><td colSpan={5} className="empty-state">No pay profiles yet.</td></tr>}
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong> <small>{p.code}</small>{!p.is_active && <span className="badge badge-closed">Inactive</span>}</td>
                  <td className="num">{pct(p.base_commission_rate)}</td>
                  <td className="num">{pct(p.peer_override_rate)}</td>
                  <td>
                    {p.rules.length === 0 ? "—" : (
                      <ul className="hr-plain-list">
                        {p.rules.map((r) => (
                          <li key={r.id}>
                            {r.insurer_name}: {r.bonus_rate ? pct(r.bonus_rate) : money(r.bonus_amount)} {r.period.toLowerCase()} above {r.basis === "Policy count" ? `${r.threshold} policies` : `${money(r.threshold)} ${r.basis}`}
                            {access.managePay && (
                              <button type="button" className="hr-link" onClick={() => window.confirm("Remove this bonus rule?") && run(() => api.delete(`/api/hr-admin/comp/bonus-rules/${r.id}`), "Rule removed.")}> remove</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {access.managePay && (
                      <span className="hr-actions">
                        <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setProfileId(p.id); setProfile({ code: p.code, name: p.name, base_commission_rate: String(+(p.base_commission_rate * 100).toFixed(4)), peer_override_rate: String(+(p.peer_override_rate * 100).toFixed(4)), notes: p.notes ?? "" }); }}>Edit</button>
                        <button type="button" className="btn-secondary btn btn-sm" onClick={() => setRuleFor(p.id)}>Add bonus</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ruleFor && (
          <form className="hr-form" onSubmit={saveRule}>
            <h3>Carrier bonus for {profiles.find((p) => p.id === ruleFor)?.name}</h3>
            <div className="form-grid">
              <SelectField label="Carrier" blank="All carriers" value={rule.insurer_id} onChange={(v) => setRule({ ...rule, insurer_id: v })} options={(data.data?.insurers ?? []).map((i) => ({ value: i.id, label: i.name }))} />
              <SelectField label="Measured on" blank={null} value={rule.basis} onChange={(v) => setRule({ ...rule, basis: v })} options={(data.data?.bases ?? []).map((b) => ({ value: b, label: b }))} />
              <SelectField label="Period" blank={null} value={rule.period} onChange={(v) => setRule({ ...rule, period: v })} options={(data.data?.periods ?? []).map((b) => ({ value: b, label: b }))} />
              <TextField label="Threshold" type="number" step="any" value={rule.threshold} onChange={(v) => setRule({ ...rule, threshold: v })} hint="Bonus applies once this is exceeded." />
              <TextField label="Bonus (%)" type="number" step="any" value={rule.bonus_rate} onChange={(v) => setRule({ ...rule, bonus_rate: v })} />
              <TextField label="or fixed bonus (₦)" type="number" step="any" value={rule.bonus_amount} onChange={(v) => setRule({ ...rule, bonus_amount: v })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>Add bonus rule</button>
              <button type="button" className="btn-secondary btn" onClick={() => setRuleFor(null)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {access.managePay && (
        <form className="card hr-form" onSubmit={assignProfile}>
          <h2>Assign a profile</h2>
          <p className="hr-hint">The person's current assignment ends the day before this one starts, and the old one stays in their history.</p>
          <div className="form-grid">
            <SelectField label="Person" required value={assign.employee_id} onChange={(v) => setAssign({ ...assign, employee_id: v })} options={employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
            <SelectField label="Profile" required value={assign.profile_id} onChange={(v) => setAssign({ ...assign, profile_id: v })} options={profiles.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))} />
            <TextField label="Base salary a year (₦)" type="number" step="any" required value={assign.base_salary_annual} onChange={(v) => setAssign({ ...assign, base_salary_annual: v })} />
            <TextField label="Effective from" type="date" required value={assign.effective_from} onChange={(v) => setAssign({ ...assign, effective_from: v })} />
            <TextField label="Reason" required value={assign.reason} onChange={(v) => setAssign({ ...assign, reason: v })} placeholder="Hire, promotion, annual review…" />
          </div>
          <div className="form-actions"><button type="submit" className="btn" disabled={busy}>Assign</button></div>
        </form>
      )}

      <div className="card">
        <h2>Pay history</h2>
        <div className="form-grid">
          <SelectField label="Person" value={viewing} onChange={setViewing} options={employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
        </div>
        {history.data && (
          <div className="exec-table-wrap table-wrap">
            <table className="exec-table is-static hr-table">
              <thead><tr><th>From</th><th>To</th><th>Profile</th><th className="num">Base salary</th><th>Reason</th><th>Set by</th></tr></thead>
              <tbody>
                {history.data.history.length === 0 && <tr><td colSpan={6} className="empty-state">No pay assignments.</td></tr>}
                {history.data.history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.effective_from}</td><td>{h.effective_to ?? "current"}</td><td>{h.profile?.name}</td>
                    <td className="num">{money(h.base_salary_annual)}</td><td>{h.reason}</td><td>{h.set_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
