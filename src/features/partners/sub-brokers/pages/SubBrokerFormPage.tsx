import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { isEmail, isNuban, isPhone, parseSplitPercent, useSubBrokerMeta, type SubBroker } from "../lib/subBrokers";

interface ClassSplitRow {
  cls: string;
  percent: string;
}

const EMPTY = {
  type: "Individual", name: "", contact_person: "", phone: "", email: "", address: "", state: "", rc_number: "", tin: "",
  bank_name: "", account_name: "", account_number: "", onboarded_on: new Date().toISOString().slice(0, 10),
  relationship_officer_user_id: "", notes: "",
};

// Register or edit a sub-broker. Registration also captures the commission
// split agreed at inception (required); changing it later goes through the
// versioned, maker-checker flow on the detail page's Commission Splits tab.
export function SubBrokerFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { meta, can } = useSubBrokerMeta();
  const [form, setForm] = useState({ ...EMPTY });
  const [defaultSplit, setDefaultSplit] = useState("");
  const [classSplits, setClassSplits] = useState<ClassSplitRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maskedAccount, setMaskedAccount] = useState(false);

  const existing = useQuery({
    queryKey: ["sub-brokers", id],
    queryFn: () => api.get<{ subBroker: SubBroker }>(`/api/sub-brokers/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    const sb = existing.data?.subBroker;
    if (!sb) return;
    setForm({
      type: sb.type, name: sb.name, contact_person: sb.contact_person || "", phone: sb.phone || "", email: sb.email || "",
      address: sb.address || "", state: sb.state || "", rc_number: sb.rc_number || "", tin: sb.tin || "", bank_name: sb.bank_name || "",
      account_name: sb.account_name || "", account_number: sb.account_number || "", onboarded_on: sb.onboarded_on || "",
      relationship_officer_user_id: sb.relationship_officer_user_id ? String(sb.relationship_officer_user_id) : "", notes: sb.notes || "",
    });
    setMaskedAccount(!sb.bank_visible && Boolean(sb.account_number));
  }, [existing.data]);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Same rules as the server (lib/subBrokers.js).
  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (form.type === "Corporate" && !form.rc_number.trim()) e.rc_number = "RC number is required for a corporate sub-broker.";
    if (form.email && !isEmail(form.email.trim())) e.email = "Enter a valid email address.";
    if (form.phone && !isPhone(form.phone)) e.phone = "Phone must be 7 to 15 digits.";
    const anyBank = form.bank_name || form.account_name || form.account_number;
    const accountChanged = !(isEdit && maskedAccount && form.account_number.includes("*"));
    if (anyBank && !(form.bank_name && form.account_name && form.account_number)) e.bank = "Bank name, account name and account number go together.";
    if (form.account_number && accountChanged && !isNuban(form.account_number)) e.account_number = "Account number must be a 10-digit NUBAN.";
    if (!isEdit) {
      if (parseSplitPercent(defaultSplit) === null) e.defaultSplit = "Enter the agreed split: above 0% and at most 100%, up to 2 decimals.";
      classSplits.forEach((c, i) => {
        if (!c.cls) e[`cls${i}`] = "Choose a class.";
        else if (parseSplitPercent(c.percent) === null) e[`cls${i}`] = "Split must be above 0% and at most 100%.";
      });
      const names = classSplits.map((c) => c.cls).filter(Boolean);
      if (new Set(names).size !== names.length) e.classDupes = "A class appears more than once.";
    }
    return e;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { ...form, relationship_officer_user_id: form.relationship_officer_user_id || null };
      if (isEdit) {
        if (maskedAccount && form.account_number.includes("*")) delete body.account_number;
        await api.put(`/api/sub-brokers/${id}`, body);
      } else {
        body.default_split_percent = parseSplitPercent(defaultSplit);
        body.class_splits = classSplits.map((c) => ({ class_of_business: c.cls, percent: parseSplitPercent(c.percent) }));
      }
      const res = isEdit ? { subBroker: { id: Number(id) } } : await api.post<{ subBroker: SubBroker }>("/api/sub-brokers", body);
      await queryClient.invalidateQueries({ queryKey: ["sub-brokers"] });
      navigate(`/sub-brokers/${res.subBroker.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const field = (label: string, key: keyof typeof EMPTY, opts: { type?: string; required?: boolean; span?: string; error?: string; hint?: string } = {}) => (
    <div className={`field${opts.span ? ` ${opts.span}` : ""}`}>
      <label htmlFor={key}>{label}{opts.required ? " *" : ""}</label>
      <input id={key} type={opts.type || "text"} value={form[key]} onChange={set(key)} aria-invalid={Boolean(opts.error)} />
      {opts.hint && <small className="muted">{opts.hint}</small>}
      {opts.error && <small className="field-error" style={{ color: "var(--status-critical)" }}>{opts.error}</small>}
    </div>
  );

  if (isEdit && existing.isError) return <div className="flash flash-error">Sub-broker not found.</div>;
  if (meta && !can(isEdit ? "subbroker.edit" : "subbroker.create")) {
    return <div className="flash flash-error">You don't have permission to {isEdit ? "edit" : "register"} sub-brokers.</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? `Edit ${existing.data?.subBroker.reference_no ?? "sub-broker"}` : "Register Sub-Broker"}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="card">
          <h2>Profile</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="type">Type *</label>
              <select id="type" value={form.type} onChange={set("type")}>
                {(meta?.types ?? ["Individual", "Corporate"]).map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {field(form.type === "Corporate" ? "Company name" : "Full name", "name", { required: true, span: "span-2", error: errors.name })}
            {field("Contact person", "contact_person")}
            {field("Phone", "phone", { error: errors.phone, hint: "Must be unique across sub-brokers." })}
            {field("Email", "email", { type: "email", error: errors.email })}
            {field("RC number", "rc_number", { required: form.type === "Corporate", error: errors.rc_number })}
            {field("TIN", "tin")}
            {field("Date of partnership", "onboarded_on", { type: "date" })}
            {field("Address", "address", { span: "span-2" })}
            <div className="field">
              <label htmlFor="state">State</label>
              <select id="state" value={form.state} onChange={set("state")}>
                <option value="">—</option>
                {(meta?.states ?? []).map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="officer">Relationship officer</label>
              <select id="officer" value={form.relationship_officer_user_id} onChange={set("relationship_officer_user_id")}>
                <option value="">Unassigned</option>
                {(meta?.officers ?? []).map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Payout bank details</h2>
          {errors.bank && <div className="flash flash-error">{errors.bank}</div>}
          {isEdit && maskedAccount && <div className="flash flash-info">The account number is hidden from your role. Leave it as is to keep it, or type a new one to replace it.</div>}
          <div className="form-grid">
            {field("Bank name", "bank_name")}
            {field("Account name", "account_name")}
            {field("Account number (NUBAN)", "account_number", { error: errors.account_number, hint: "10 digits." })}
          </div>
        </div>

        {!isEdit && (
          <div className="card">
            <h2>Agreed commission split</h2>
            <p className="muted">The share of our brokerage paid to the sub-broker, agreed at inception. Later changes need a second admin's approval.</p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="defaultSplit">Default split (%) *</label>
                <input id="defaultSplit" inputMode="decimal" value={defaultSplit} onChange={(e) => setDefaultSplit(e.target.value)} aria-invalid={Boolean(errors.defaultSplit)} />
                {errors.defaultSplit && <small style={{ color: "var(--status-critical)" }}>{errors.defaultSplit}</small>}
              </div>
            </div>
            <h3>Class-specific splits (optional)</h3>
            {errors.classDupes && <div className="flash flash-error">{errors.classDupes}</div>}
            {classSplits.map((c, i) => (
              <div className="form-grid" key={i} style={{ marginBottom: "0.5rem" }}>
                <div className="field">
                  <label htmlFor={`cls-${i}`}>Class of business</label>
                  <select id={`cls-${i}`} value={c.cls} onChange={(e) => setClassSplits((rows) => rows.map((r, j) => (j === i ? { ...r, cls: e.target.value } : r)))}>
                    <option value="">Choose…</option>
                    {(meta?.classes ?? []).map((k) => <option key={k}>{k}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`pct-${i}`}>Split (%)</label>
                  <input id={`pct-${i}`} inputMode="decimal" value={c.percent} onChange={(e) => setClassSplits((rows) => rows.map((r, j) => (j === i ? { ...r, percent: e.target.value } : r)))} />
                  {errors[`cls${i}`] && <small style={{ color: "var(--status-critical)" }}>{errors[`cls${i}`]}</small>}
                </div>
                <div className="field" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => setClassSplits((rows) => rows.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setClassSplits((rows) => [...rows, { cls: "", percent: "" }])}>+ Add class split</button>
          </div>
        )}

        <div className="card">
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" rows={3} value={form.notes} onChange={set("notes")} />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Save changes" : "Register sub-broker"}</button>
          <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
