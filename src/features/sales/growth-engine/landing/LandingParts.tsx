// Pieces shared by the public /quote landing pages.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { COMPANY_SHORT } from "./brand";
import "@/shared/ads/ads.css";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="adlp">
      <header className="adlp-top">
        <Link to="/quote/motor" className="adlp-brand"><img src="/logo.png" alt="" width={32} height={32} /> {COMPANY_SHORT}</Link>
        <nav aria-label="Quotes">
          <Link to="/quote/motor">Motor</Link>
          <Link to="/quote/corporate">Corporate &amp; SME</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="adlp-foot">
        <p>{COMPANY_SHORT} is an insurance broker licensed by the National Insurance Commission (NAICOM). We compare quotes from partner insurers;
          cover starts only when an insurer accepts the risk and issues its policy. Your details are used to prepare your quote and are handled under the
          Nigeria Data Protection Act 2023.</p>
      </footer>
    </div>
  );
}

export function Highlights({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ul className="adlp-highlights">
      {items.map((h) => (
        <li key={h.title}>
          <strong>{h.title}</strong>
          <span>{h.text}</span>
        </li>
      ))}
    </ul>
  );
}
