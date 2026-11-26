import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/shared/api/client";
import { PremiumEstimate } from "./PremiumEstimate";
import { FIRE_OCCUPATIONS } from "../lib/premiumEstimate";

// Lists a field can offer while typing (Field.suggest).
const SUGGESTIONS: Record<string, string[]> = { fireTariff: FIRE_OCCUPATIONS };

// The Request for Quote form, shared by the public marketplace page (/marketplace/quote) and the
// customer portal's Quote Requests page. The questions for each class come from the server (backend
// modules/clients/inbox/rfqForms.js), which validates the answers against the same list.

export interface Field {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "money" | "date" | "select" | "multiselect" | "yesno";
  required?: boolean;
  options?: string[];
  hint?: string;
  suggest?: string;
}
export interface FormDef {
  id: string;
  title: string;
  fields: Field[];
}
export interface FormMeta {
  categories: { name: string; classes: { name: string; form: string }[] }[];
  forms: FormDef[];
  commonFields: Field[];
  insurers: { id: number; name: string }[];
  ackHours: number;
  requestTypes?: string[];
}
export type Answers = Record<string, string | string[]>;

const WIDE = new Set(["textarea", "multiselect"]);

export function FieldInput({ field, value, onChange }: { field: Field; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const id = `rfq-${field.key}`;
  const label = (
    <label htmlFor={id}>
      {field.label} {field.required && <span className="required-mark">*</span>}
    </label>
  );
  let input;
  switch (field.type) {
    case "textarea":
      input = <textarea id={id} rows={3} required={field.required} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      input = (
        <select id={id} required={field.required} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case "yesno":
      input = (
        <div className="rfq-choices" role="radiogroup" aria-labelledby={id}>
          {["No", "Yes"].map((o) => (
            <label key={o} className="rfq-choice">
              <input type="radio" name={id} value={o} required={field.required} checked={value === o} onChange={() => onChange(o)} /> {o}
            </label>
          ))}
        </div>
      );
      break;
    case "multiselect": {
      const list = Array.isArray(value) ? value : [];
      input = (
        <div className="rfq-choices">
          {field.options?.map((o) => (
            <label key={o} className="rfq-choice">
              <input
                type="checkbox"
                checked={list.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
              /> {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      input = (
        <input
          id={id}
          list={field.suggest && SUGGESTIONS[field.suggest] ? `${id}-list` : undefined}
          autoComplete={field.suggest ? "off" : undefined}
          type={field.type === "date" ? "date" : field.type === "text" ? "text" : "number"}
          min={field.type === "number" || field.type === "money" ? 0 : undefined}
          step={field.type === "money" ? "any" : undefined}
          inputMode={field.type === "money" || field.type === "number" ? "decimal" : undefined}
          required={field.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div className={`field${WIDE.has(field.type) ? " span-3" : ""}`}>
      {field.type === "yesno" ? <span id={id} className="rfq-label">{field.label} {field.required && <span className="required-mark">*</span>}</span> : label}
      {input}
      {field.suggest && SUGGESTIONS[field.suggest] && (
        <datalist id={`${id}-list`}>
          {SUGGESTIONS[field.suggest].map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
      {field.hint && <p className="field-hint">{field.hint}</p>}
    </div>
  );
}

export interface QuoteContact {
  contact_name: string;
  company_name: string;
  contact_email: string;
  contact_phone: string;
}

// The marketplace estimator passes what was typed (?class=…&vehicle_value=…); the form keeps only its own keys.
export function answersFromParams(searchParams: URLSearchParams): Answers {
  const out: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== "class" && /^[a-z_]{2,40}$/.test(key)) out[key] = value.slice(0, 200);
  });
  return out;
}

interface Props {
  meta: FormMeta;
  submitUrl: string;
  /** Class to preselect: an exact name or the start of one ("Private Motor"). */
  initialClass?: string | null;
  contact?: Partial<QuoteContact> | null;
  /** The portal also offers "Policy Change"; the public page is always New Coverage. */
  showRequestType?: boolean;
  /** The public page adds a hidden field that only bots fill in. */
  honeypot?: boolean;
  /** Answers to start from, e.g. what the visitor typed into the marketplace estimator. */
  initialAnswers?: Answers;
  onSubmitted?: (message: string) => void;
  doneActions?: ReactNode;
}

export function RequestQuoteForm({ meta, submitUrl, initialClass, contact: prefill, showRequestType, honeypot, initialAnswers, onSubmitted, doneActions }: Props) {
  const [requestType, setRequestType] = useState(meta.requestTypes?.[0] ?? "New Coverage");
  const [className, setClassName] = useState("");
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers ?? {});
  const [insurerId, setInsurerId] = useState("");
  const [contact, setContact] = useState({ contact_name: "", company_name: "", contact_email: "", contact_phone: "", preferred_contact: "Email" });
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const classes = useMemo(() => meta.categories.flatMap((c) => c.classes), [meta]);

  useEffect(() => {
    if (!classes.length || className) return;
    const wanted = (initialClass || "").toLowerCase();
    if (!wanted) return;
    const found = classes.find((c) => c.name.toLowerCase() === wanted) || classes.find((c) => c.name.toLowerCase().startsWith(wanted));
    if (found) setClassName(found.name);
  }, [classes, className, initialClass]);

  useEffect(() => {
    if (!prefill) return;
    setContact((c) => ({
      ...c,
      contact_name: c.contact_name || prefill.contact_name || "",
      company_name: c.company_name || prefill.company_name || "",
      contact_email: c.contact_email || prefill.contact_email || "",
      contact_phone: c.contact_phone || prefill.contact_phone || "",
    }));
  }, [prefill]);

  const form = useMemo(() => {
    const id = classes.find((c) => c.name === className)?.form;
    return meta.forms.find((f) => f.id === id) ?? null;
  }, [classes, className, meta]);

  function setAnswer(key: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Please tick the box to confirm we may use these details to get you a quote.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>(submitUrl, {
        ...(showRequestType ? { request_type: requestType } : {}),
        class_of_business: className,
        insurer_id: insurerId ? Number(insurerId) : null,
        answers,
        ...contact,
        consent,
        ...(honeypot ? { website } : {}),
      });
      setDone(result.message);
      onSubmitted?.(result.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again or call us.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card rfq-done" role="status">
        <h2>Request received ✓</h2>
        <p>{done}</p>
        <p className="text-muted">A copy of your request has been sent to your email. Need it sooner? Call us.</p>
        <div className="form-actions">
          {doneActions}
          <button type="button" className="btn btn-secondary" onClick={() => { setDone(null); setAnswers({}); setClassName(""); setInsurerId(""); setConsent(false); }}>
            Request another quote
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="rfq-page" onSubmit={handleSubmit}>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <h2>1. Your cover</h2>
        <div className="form-grid">
          {showRequestType && (
            <div className="field">
              <label htmlFor="rfq-type">Request type <span className="required-mark">*</span></label>
              <select id="rfq-type" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                {(meta.requestTypes ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div className={`field${showRequestType ? "" : " span-2"}`}>
            <label htmlFor="rfq-class">Class of insurance <span className="required-mark">*</span></label>
            <select id="rfq-class" required value={className} onChange={(e) => setClassName(e.target.value)}>
              <option value="">Choose the cover you need…</option>
              {meta.categories.map((cat) => (
                <optgroup key={cat.name} label={cat.name}>
                  {cat.classes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rfq-insurer">Preferred insurer</label>
            <select id="rfq-insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
              <option value="">No preference - recommend the best</option>
              {meta.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        </div>
        {!form && <p className="field-hint">Choose the class of insurance to see the questions for that cover.</p>}
      </div>

      {form && (
        <>
          <div className="card">
            <h2>2. {form.title}</h2>
            <div className="form-grid">
              {form.fields.map((f) => <FieldInput key={f.key} field={f} value={answers[f.key]} onChange={(v) => setAnswer(f.key, v)} />)}
            </div>
            <PremiumEstimate className={className} formId={form.id} answers={answers} />
          </div>

          <div className="card">
            <h2>3. Cover and insurance history</h2>
            <div className="form-grid">
              {meta.commonFields.map((f) => <FieldInput key={f.key} field={f} value={answers[f.key]} onChange={(v) => setAnswer(f.key, v)} />)}
            </div>
          </div>

          <div className="card">
            <h2>4. Your contact details</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="rfq-name">Full name <span className="required-mark">*</span></label>
                <input id="rfq-name" type="text" required autoComplete="name" value={contact.contact_name} onChange={(e) => setContact({ ...contact, contact_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="rfq-company">Company name (if insuring a business)</label>
                <input id="rfq-company" type="text" autoComplete="organization" value={contact.company_name} onChange={(e) => setContact({ ...contact, company_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="rfq-email">Email address <span className="required-mark">*</span></label>
                <input id="rfq-email" type="email" required autoComplete="email" value={contact.contact_email} onChange={(e) => setContact({ ...contact, contact_email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="rfq-phone">Mobile number <span className="required-mark">*</span></label>
                <input id="rfq-phone" type="tel" required autoComplete="tel" placeholder="e.g. 0803 123 4567" value={contact.contact_phone} onChange={(e) => setContact({ ...contact, contact_phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="rfq-preferred">How should we send your quote?</label>
                <select id="rfq-preferred" value={contact.preferred_contact} onChange={(e) => setContact({ ...contact, preferred_contact: e.target.value })}>
                  <option>Email</option>
                  <option>Phone call</option>
                  <option>WhatsApp</option>
                </select>
              </div>
              {honeypot && (
                <div className="rfq-hp" aria-hidden="true">
                  <label htmlFor="rfq-website">Website</label>
                  <input id="rfq-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
              )}
            </div>
            <label className="rfq-choice rfq-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              I confirm the information above is true to the best of my knowledge, and I agree that Green Pacific may share
              the risk details with insurers to obtain quotations and contact me about this request.
            </label>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>
                {busy ? "Sending…" : "Submit request for quote"}
              </button>
            </div>
            <p className="field-hint">This is a request for a quotation, not a contract of insurance. Cover starts only when terms are agreed and accepted.</p>
          </div>
        </>
      )}
    </form>
  );
}
