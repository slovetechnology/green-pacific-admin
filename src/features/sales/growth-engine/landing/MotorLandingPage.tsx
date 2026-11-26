// /quote/motor: the retail motor landing page (public). Two fields and one button: the lead is captured with the
// stored click ids, the Pixel/GTM lead events fire with the server's event id, and WhatsApp opens with
// "[Ref: SLB-XXXX]" pre-filled so the conversation keeps the attribution. The AI assistant is one tap away.
import { useState, type FormEvent } from "react";
import { captureLead } from "@/shared/ads/adAttribution";
import { WebAiIntakeWidget } from "@/shared/ads/WebAiIntakeWidget";
import { openPendingTab } from "./brand";
import { Highlights, LandingShell } from "./LandingParts";

export function MotorLandingPage() {
  const [vehicle, setVehicle] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const tab = openPendingTab();
    try {
      const r = await captureLead({ phone, vehicle_or_asset_details: vehicle || undefined, website: hp || undefined });
      setRef(r.tracking_ref);
      if (r.whatsapp_deeplink && tab) tab.location.href = r.whatsapp_deeplink;
      else {
        tab?.close();
        setShowChat(true); // WhatsApp isn't set up: carry on in the web chat
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Please check your number and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LandingShell>
      <section className="adlp-hero">
        <div className="adlp-copy">
          <p className="adlp-kicker">Motor insurance · Nigeria</p>
          <h1>Compare Top Nigerian Motor Insurers in 60 Seconds—With a Broker Who Fights for Your Claims.</h1>
          <Highlights items={[
            { title: "Multi-insurer rate benchmarking", text: "We put your car in front of several NAICOM-licensed insurers and show you the best value, not just the first price." },
            { title: "Instant genuine NIID verification", text: "Every certificate is checked on the Nigerian Insurance Industry Database portal, so you never carry a fake." },
            { title: "Dedicated claims advocacy", text: "When something happens, your broker handles the paperwork and pushes the insurer until you are paid." },
          ]} />
        </div>
        <form className="adlp-card" onSubmit={submit} noValidate>
          <h2>Get your instant quote</h2>
          <label>Vehicle make &amp; year<input type="text" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. Toyota Corolla 2018" maxLength={200} /></label>
          <label>WhatsApp phone number<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" autoComplete="tel" required /></label>
          <input type="text" className="adw-hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} aria-hidden="true" />
          {error ? <p className="adw-error" role="alert">{error}</p> : null}
          <button type="submit" className="adlp-cta" disabled={busy || !phone.trim()}>{busy ? "Opening WhatsApp…" : "Get Instant Quote on WhatsApp"}</button>
          {ref ? <p className="adlp-ref">Your reference: <strong>{ref}</strong>. If WhatsApp didn't open, use the assistant below.</p> : null}
          <button type="button" className="adlp-link" onClick={() => setShowChat((s) => !s)} aria-expanded={showChat}>
            {showChat ? "Hide the Web AI Quote Assistant" : "Prefer to chat here? Open the Web AI Quote Assistant"}
          </button>
        </form>
      </section>
      {showChat ? <section className="adlp-chat"><WebAiIntakeWidget mode="embedded" title="Web AI Quote Assistant" /></section> : null}
    </LandingShell>
  );
}
