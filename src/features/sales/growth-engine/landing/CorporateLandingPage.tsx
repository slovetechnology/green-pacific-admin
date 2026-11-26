// /quote/corporate: the commercial and SME risk-audit landing page (public). Company, cover type and a work email or
// WhatsApp number; an email alone also asks for a phone number, because the risk desk calls and WhatsApps.
// After capture the AI Risk Desk chat opens on the same lead.
import { useState, type FormEvent } from "react";
import { captureLead } from "@/shared/ads/adAttribution";
import { WebAiIntakeWidget } from "@/shared/ads/WebAiIntakeWidget";
import { Highlights, LandingShell } from "./LandingParts";

const COVERS = [
  { value: "GROUP_LIFE", label: "Group Life (Pension Reform Act)" },
  { value: "FLEET", label: "Motor Fleet" },
  { value: "FIRE_BURGLARY", label: "Fire & Burglary" },
  { value: "MARINE", label: "Marine / Goods in Transit" },
  { value: "ENGINEERING", label: "Engineering (NIIRA 2025)" },
];
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function CorporateLandingPage() {
  const [company, setCompany] = useState("");
  const [cover, setCover] = useState("GROUP_LIFE");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const emailGiven = looksLikeEmail(contact);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!company.trim()) return setError("Enter your company name.");
    if (emailGiven && !phone.trim()) return setError("Add a phone number so our risk desk can reach you.");
    setBusy(true);
    try {
      const r = await captureLead({
        company_name: company.trim(),
        product_line: cover,
        email: emailGiven ? contact.trim() : undefined,
        phone: emailGiven ? phone : contact,
        website: hp || undefined,
      });
      setRef(r.tracking_ref);
      setShowChat(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LandingShell>
      <section className="adlp-hero is-corporate">
        <div className="adlp-copy">
          <p className="adlp-kicker">Corporate &amp; SME risk audit</p>
          <h1>Reduce Your Corporate Insurance Spend by Up to 18% While Strengthening Claims Protection.</h1>
          <Highlights items={[
            { title: "Zero extra brokerage cost", text: "Insurers pay our brokerage, so you pay nothing more than going direct, with an independent adviser on your side." },
            { title: "Statutory compliance, covered", text: "Group Life under the Pension Reform Act (PenCom) and the compulsory covers of NIIRA 2025, checked and in force." },
            { title: "SLA-backed claims recovery", text: "Agreed timelines for Fleet, Group Life, Fire & Burglary and Marine claims, chased by a dedicated claims team." },
          ]} />
        </div>
        {ref ? (
          <div className="adlp-card">
            <h2>Thank you</h2>
            <p>Your reference is <strong>{ref}</strong>. Our risk desk will contact you shortly. Meanwhile, the AI Risk Desk can take the details a broker needs.</p>
          </div>
        ) : (
          <form className="adlp-card" onSubmit={submit} noValidate>
            <h2>Book your free risk audit</h2>
            <label>Company name<input type="text" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={150} required /></label>
            <label>Cover type
              <select value={cover} onChange={(e) => setCover(e.target.value)}>
                {COVERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label>Work email or WhatsApp number<input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@company.ng or 0803 123 4567" required /></label>
            {emailGiven ? (
              <label>Phone number for the risk desk<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" autoComplete="tel" /></label>
            ) : null}
            <input type="text" className="adw-hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} aria-hidden="true" />
            {error ? <p className="adw-error" role="alert">{error}</p> : null}
            <button type="submit" className="adlp-cta" disabled={busy}>{busy ? "Sending…" : "Request my risk audit"}</button>
            <button type="button" className="adlp-link" onClick={() => setShowChat((s) => !s)} aria-expanded={showChat}>
              {showChat ? "Hide the AI Risk Desk" : "Or talk to the AI Risk Desk now"}
            </button>
          </form>
        )}
      </section>
      {showChat ? <section className="adlp-chat"><WebAiIntakeWidget key={ref ?? "anon"} mode="embedded" title="AI Risk Desk" productLine={cover} /></section> : null}
    </LandingShell>
  );
}
