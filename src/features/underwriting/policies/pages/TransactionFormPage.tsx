import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RiskSchedule, newRow, rowValue, type RiskKind, type RiskRow } from "../components/RiskSchedule";
import { ScheduleSwitcher, useScheduleSpec, precheckSchedule, errorsFromServer, type ScheduleValue, type ScheduleErrors } from "../components/schedules";

interface FormOptions {
  clients: string[];
  insurers: string[];
  producers: string[];
  clientDirectory: Record<string, { address: string; city: string; state: string }>;
  insurerDirectory: Record<string, { address: string }>;
  statuses: string[];
  businessTypes: string[];
  billingModes: string[];
  classes: string[];
  motorClasses: string[];
  nonMotorClasses: string[];
  lifeClasses: string[];
  propertyCategories: string[];
  propertyCategorySchedules?: Record<string, string>;
  nextCreditNotePreview: string;
}

// Mirrors isMotorClass() in backend/src/shared/constants.js.
function isMotorClass(cls: string, motorClasses: string[] = []): boolean {
  const c = cls.trim().toLowerCase();
  if (!c) return false;
  return (
    motorClasses.some((m) => m.toLowerCase() === c) ||
    /^(private motor|commercial (vehicle|motor)|motor ?cycle|motor trade)\b/.test(c)
  );
}

// Mirrors isLifeClass() in backend/src/shared/constants.js.
function isLifeClass(cls: string, lifeClasses: string[] = []): boolean {
  const c = cls.trim().toLowerCase();
  if (!c) return false;
  return lifeClasses.some((m) => m.toLowerCase() === c) || /^(group life|individual life|combined group life|life insurance)\b/.test(c);
}

interface FormValues {
  client_name: string;
  client_address: string;
  client_city: string;
  client_state: string;
  insurer_name: string;
  insurer_address: string;
  trans_date: string;
  class_of_business: string;
  class_of_business_other: string;
  business_type: string;
  policy_no: string;
  slip_no: string;
  debit_note_no: string;
  // "" = the insurer's default (new) / unchanged (edit). See backend lib/transactions.js.
  billing_mode: string;
  // "" = transaction date + 30 days (new) / unchanged (edit).
  payment_due_date: string;
  sum_insured: string;
  // Motor third-party property damage limit (a liability limit, not the
  // vehicle value); statutory minimums are compliance rules on the backend.
  tppd_limit: string;
  annual_premium_due: string;
  start_date: string;
  end_date: string;
  proportion: string;
  premium_due: string;
  commission_rate: string;
  brokerage: string;
  co_brokers: string;
  premium_paid: string;
  receipt_no: string;
  status: string;
  date_of_payment: string;
  commission_earned: string;
  deferred_commission: string;
  producer: string;
  subject_matter: string;
  proforma_inv: string;
  transaction_narration: string;
  // Risk details: vehicle_* for motor classes, property_* / risk_location for the rest.
  // The vehicle value / sum insured / limit of liability is `sum_insured`.
  vehicle_make: string;
  registration_no: string;
  engine_no: string;
  chassis_no: string;
  property_type: string;
  property_description: string;
  risk_location: string;
}

const EMPTY: FormValues = {
  client_name: "",
  client_address: "",
  client_city: "",
  client_state: "",
  insurer_name: "",
  insurer_address: "",
  trans_date: new Date().toISOString().slice(0, 10),
  class_of_business: "",
  class_of_business_other: "",
  business_type: "",
  billing_mode: "",
  payment_due_date: "",
  policy_no: "",
  slip_no: "",
  debit_note_no: "",
  sum_insured: "",
  tppd_limit: "",
  annual_premium_due: "",
  start_date: "",
  end_date: "",
  proportion: "1",
  premium_due: "",
  commission_rate: "",
  brokerage: "",
  co_brokers: "0",
  premium_paid: "",
  receipt_no: "",
  status: "Unpaid",
  date_of_payment: "",
  commission_earned: "",
  deferred_commission: "",
  producer: "",
  subject_matter: "",
  proforma_inv: "",
  transaction_narration: "",
  vehicle_make: "",
  registration_no: "",
  engine_no: "",
  chassis_no: "",
  property_type: "",
  property_description: "",
  risk_location: "",
};

export function TransactionFormPage() {
  const { txId } = useParams();
  const isEdit = Boolean(txId);
  const [searchParams] = useSearchParams();
  const preselectClientId = searchParams.get("client_id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(EMPTY);
  // One schedule per kind of risk, so switching class and back does not lose what was typed.
  const [schedules, setSchedules] = useState<Record<RiskKind, RiskRow[]>>({ vehicle: [], property: [], life: [] });
  const [riskSchedule, setRiskSchedule] = useState<ScheduleValue | null>(null);
  const [scheduleErrors, setScheduleErrors] = useState<ScheduleErrors>({});
  const [scheduleTouched, setScheduleTouched] = useState(false);
  // What the policy had when it was opened: a policy that predates schedules is not forced to gain one on an unrelated edit.
  const [loaded, setLoaded] = useState<{ cls: string; hadSchedule: boolean }>({ cls: "", hadSchedule: false });
  const [error, setError] = useState<string | null>(null);
  // A compliance block from the backend (lib/compliance.js): the failing
  // rules, and whether this user (an admin) may override with a reason.
  const [complianceBlock, setComplianceBlock] = useState<{ failures: { code: string; name: string; message: string }[]; canOverride: boolean } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string>("");
  const [showReceiptPrompt, setShowReceiptPrompt] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["transactions", "meta"],
    queryFn: () => api.get<FormOptions>("/api/transactions/meta/form-options"),
  });

  const editQuery = useQuery({
    queryKey: ["transactions", txId],
    queryFn: () => api.get<{ transaction: Record<string, unknown> }>(`/api/transactions/${txId}`),
    enabled: isEdit,
  });

  const preselectQuery = useQuery({
    queryKey: ["clients", preselectClientId],
    queryFn: () => api.get<{ client: Record<string, unknown> }>(`/api/clients/${preselectClientId}`),
    enabled: !isEdit && Boolean(preselectClientId),
  });

  useEffect(() => {
    if (isEdit && editQuery.data) {
      const t = editQuery.data.transaction;
      const num = (v: unknown) => (v === null || v === undefined ? "" : String(v));
      setEditingClientId(num(t.client_id));
      const savedSchedule = (editQuery.data as { riskSchedule?: { classKey: string; data: Record<string, unknown> } | null }).riskSchedule ?? null;
      setRiskSchedule(savedSchedule);
      setLoaded({ cls: String(t.class_of_business ?? ""), hadSchedule: Boolean(savedSchedule) });
      const items = (editQuery.data as { riskItems?: Record<string, unknown>[] }).riskItems ?? [];
      setSchedules({
        vehicle: items.filter((i) => i.kind === "vehicle").map((i) => newRow(i)),
        property: items.filter((i) => i.kind === "property").map((i) => newRow(i)),
        life: items.filter((i) => i.kind === "life").map((i) => newRow(i)),
      });
      setValues((prev) => ({
        ...prev,
        client_name: String(t.client_name ?? ""),
        client_address: String(t.client_address ?? ""),
        client_city: String(t.client_city ?? ""),
        client_state: String(t.client_state ?? ""),
        insurer_name: String(t.insurer_name ?? ""),
        insurer_address: String(t.insurer_address ?? ""),
        trans_date: String(t.trans_date ?? ""),
        class_of_business: String(t.class_of_business ?? ""),
        business_type: String(t.business_type ?? ""),
        policy_no: String(t.policy_no ?? ""),
        slip_no: String(t.slip_no ?? ""),
        debit_note_no: String(t.debit_note_no ?? ""),
        billing_mode: String(t.billing_mode ?? ""),
        payment_due_date: String(t.payment_due_date ?? ""),
        sum_insured: num(t.sum_insured),
        tppd_limit: t.tppd_limit === null || t.tppd_limit === undefined ? "" : String(t.tppd_limit),
        annual_premium_due: num(t.annual_premium_due),
        start_date: String(t.start_date ?? ""),
        end_date: String(t.end_date ?? ""),
        proportion: num(t.proportion) || "1",
        premium_due: num(t.premium_due),
        commission_rate: num(t.commission_rate),
        brokerage: num(t.brokerage),
        co_brokers: num(t.co_brokers) || "0",
        premium_paid: num(t.premium_paid),
        receipt_no: String(t.receipt_no ?? ""),
        status: String(t.status ?? "Unpaid"),
        date_of_payment: String(t.date_of_payment ?? ""),
        commission_earned: num(t.commission_earned),
        deferred_commission: num(t.deferred_commission),
        producer: String(t.producer ?? ""),
        subject_matter: String(t.subject_matter ?? ""),
        proforma_inv: String(t.proforma_inv ?? ""),
        transaction_narration: String(t.transaction_narration ?? ""),
        vehicle_make: String(t.vehicle_make ?? ""),
        registration_no: String(t.registration_no ?? ""),
        engine_no: String(t.engine_no ?? ""),
        chassis_no: String(t.chassis_no ?? ""),
        property_type: String(t.property_type ?? ""),
        property_description: String(t.property_description ?? ""),
        risk_location: String(t.risk_location ?? ""),
      }));
    }
  }, [isEdit, editQuery.data]);

  useEffect(() => {
    if (!isEdit && preselectQuery.data) {
      const c = preselectQuery.data.client;
      setValues((prev) => ({
        ...prev,
        client_name: String(c.name ?? ""),
        client_address: String(c.address ?? ""),
        client_city: String(c.city ?? ""),
        client_state: String(c.state ?? ""),
      }));
    }
  }, [isEdit, preselectQuery.data]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function n(key: keyof FormValues): number {
    return parseFloat(values[key]) || 0;
  }

  function setCommissionRate(rate: string) {
    setValues((prev) => {
      const suggested = (parseFloat(prev.premium_due) || 0) * (parseFloat(rate) || 0);
      return {
        ...prev,
        commission_rate: rate,
        brokerage: suggested ? suggested.toFixed(2) : prev.brokerage,
      };
    });
  }

  // Autofill address/city/state (client) or address (insurer) the instant
  // the name field matches an existing record exactly — from the datalist
  // or typed by hand.
  function setClientName(name: string) {
    const match = opts?.clientDirectory[name];
    setValues((prev) => ({
      ...prev,
      client_name: name,
      ...(match ? { client_address: match.address, client_city: match.city, client_state: match.state } : {}),
    }));
  }

  function setInsurerName(name: string) {
    const match = opts?.insurerDirectory[name];
    setValues((prev) => ({
      ...prev,
      insurer_name: name,
      ...(match ? { insurer_address: match.address } : {}),
    }));
  }

  const totalBrokerage = n("brokerage") + n("co_brokers");
  const netPremium = n("premium_due") - totalBrokerage;

  async function handleSubmit(e: FormEvent, withOverride = false) {
    e.preventDefault();
    setError(null);
    // Class-specific risk schedule (NIIRA 2025): checked for the mandatory fields here, then in full by the server.
    const scheduleData = scheduleSpec && riskSchedule?.classKey === scheduleSpec.key ? riskSchedule.data : {};
    const sendSchedule = Boolean(scheduleSpec) && (!isEdit || scheduleTouched || loaded.hadSchedule || values.class_of_business !== loaded.cls);
    if (scheduleSpec && sendSchedule) {
      const missing = precheckSchedule(scheduleSpec, scheduleData);
      setScheduleErrors(missing);
      if (Object.keys(missing).length) {
        setError(`The ${scheduleSpec.label} risk schedule is incomplete.`);
        return;
      }
    } else {
      setScheduleErrors({});
    }
    setSubmitting(true);
    // The schedule is the source of the risk details and the sum insured, so the single-risk fields are not sent.
    const {
      vehicle_make, registration_no, engine_no, chassis_no, property_type, property_description, risk_location,
      ...rest
    } = values;
    void [vehicle_make, registration_no, engine_no, chassis_no, property_type, property_description, risk_location];
    const items = schedules[riskKind].map(({ _k, ...item }) => {
      void _k;
      return item;
    });
    const payload = {
      ...rest,
      // Without risk_items the server keeps whatever items the policy already has.
      ...(showItemTable ? { risk_items: items } : {}),
      sum_insured: scheduleTotal > 0 ? String(scheduleTotal) : values.sum_insured,
      ...(sendSchedule ? { risk_schedule_data: scheduleData } : {}),
    };
    const body = withOverride ? { ...payload, compliance_override_reason: overrideReason } : payload;
    try {
      if (isEdit) {
        await api.put(`/api/transactions/${txId}`, body);
      } else {
        const result = await api.post<{ transaction: { id: number } }>("/api/transactions", body);
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        navigate(`/transactions/${result.transaction.id}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      navigate(`/transactions/${txId}`);
    } catch (err) {
      const compliance = err instanceof ApiError ? (err.data?.compliance as { code: string; name: string; message: string }[] | undefined) : undefined;
      if (compliance?.length) {
        setComplianceBlock({ failures: compliance, canOverride: Boolean(err instanceof ApiError && err.data?.canOverride) });
      } else {
        setComplianceBlock(null);
        const serverScheduleErrors = err instanceof ApiError ? (err.data?.scheduleErrors as { path: string; message: string }[] | undefined) : undefined;
        if (serverScheduleErrors?.length) setScheduleErrors(errorsFromServer(serverScheduleErrors));
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const opts = optionsQuery.data;
  const scheduleSpec = useScheduleSpec(values.class_of_business);

  // Default commission rate for the class (Ledger Settings > Default commission rates, within the NAICOM cap).
  // Filled in once per class on a new policy while the rate is blank; never overwrites a rate someone typed.
  const effectiveClass = (values.class_of_business === "Other" ? values.class_of_business_other : values.class_of_business).trim();
  const rateDefault = useQuery({
    queryKey: ["commission-rates", "for", effectiveClass],
    queryFn: () => api.get<{ percent: number | null; cap: { percent: number; code: string } | null }>(`/api/commission-rates/for?class=${encodeURIComponent(effectiveClass)}`),
    enabled: Boolean(effectiveClass),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [autoRateClass, setAutoRateClass] = useState<string | null>(null);
  useEffect(() => {
    const pct = rateDefault.data?.percent;
    if (isEdit || pct == null || !effectiveClass || autoRateClass === effectiveClass) return;
    if (values.commission_rate !== "" && autoRateClass === null) return;
    setAutoRateClass(effectiveClass);
    setCommissionRate(String(Math.round(pct * 1000) / 100000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateDefault.data, effectiveClass, isEdit]);
  const isMotor = isMotorClass(values.class_of_business, opts?.motorClasses);
  const isLife = !isMotor && isLifeClass(values.class_of_business, opts?.lifeClasses);
  const riskKind: RiskKind = isMotor ? "vehicle" : isLife ? "life" : "property";
  // Non-motor classes describe their risk in the class's own risk schedule; only Industrial All Risks
  // still uses the generic schedule of property.
  const showItemTable = riskKind !== "property" || /^industrial all risks?\b/i.test(values.class_of_business.trim());
  const scheduleTotal = showItemTable ? schedules[riskKind].reduce((sum, r) => sum + rowValue(r), 0) : 0;

  // Start each schedule with one blank row so the fields are there as soon as a class is picked.
  const editLoaded = !isEdit || Boolean(editQuery.data);
  useEffect(() => {
    if (!values.class_of_business || !editLoaded || !showItemTable) return;
    setSchedules((prev) => (prev[riskKind].length ? prev : { ...prev, [riskKind]: [newRow()] }));
  }, [riskKind, values.class_of_business, editLoaded, showItemTable]);

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? "Edit Transaction" : "New Transaction"}</h1>
      </div>
      {!isEdit && opts && (
        <p className="page-lede">Next credit note number: <strong>{opts.nextCreditNotePreview}</strong></p>
      )}
      {error && <div className="flash flash-error">{error}</div>}
      {complianceBlock && (
        <div className="flash flash-error">
          <strong>This policy can't be saved: it breaks a compliance rule.</strong>
          <ul>
            {complianceBlock.failures.map((f) => (
              <li key={f.code}>
                {f.name}: {f.message}
              </li>
            ))}
          </ul>
          {complianceBlock.canOverride ? (
            <div>
              <label>
                Admin override reason (recorded in the audit log)
                <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </label>{" "}
              <button
                type="button"
                className="btn-danger btn btn-sm"
                disabled={!overrideReason.trim() || submitting}
                onClick={(e) => void handleSubmit(e as unknown as FormEvent, true)}
              >
                Save with override
              </button>
            </div>
          ) : (
            <p>Fix the details, or ask an admin to override.</p>
          )}
        </div>
      )}
      {showReceiptPrompt && (
        <div className="flash flash-warning" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <span>
            Marking this Paid — record the payment receipt to generate its receipt number. Any unsaved
            changes on this form will need re-entering afterward.
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                navigate(
                  `/receipts/new?client_id=${editingClientId}&transaction_id=${txId}&return=${encodeURIComponent(
                    `/transactions/${txId}/edit`
                  )}`
                )
              }
            >
              Record Receipt
            </button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setShowReceiptPrompt(false)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="section-title">Client &amp; insurer</div>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="client_name">Client name</label>
              <input
                id="client_name"
                list="client-options"
                required
                value={values.client_name}
                onChange={(e) => setClientName(e.target.value)}
              />
              <datalist id="client-options">
                {opts?.clients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="client_state">Client state</label>
              <input id="client_state" value={values.client_state} onChange={(e) => set("client_state", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="client_address">Client address</label>
              <input id="client_address" value={values.client_address} onChange={(e) => set("client_address", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="client_city">Client city</label>
              <input id="client_city" value={values.client_city} onChange={(e) => set("client_city", e.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="insurer_name">Insurer name</label>
              <input
                id="insurer_name"
                list="insurer-options"
                required
                value={values.insurer_name}
                onChange={(e) => setInsurerName(e.target.value)}
              />
              <datalist id="insurer-options">
                {opts?.insurers.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="insurer_address">Insurer address</label>
              <input
                id="insurer_address"
                value={values.insurer_address}
                onChange={(e) => set("insurer_address", e.target.value)}
              />
            </div>
          </div>

          <div className="section-title">Policy details</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="trans_date">Transaction date</label>
              <input
                id="trans_date"
                type="date"
                value={values.trans_date}
                onChange={(e) => set("trans_date", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="class_of_business">Class of business</label>
              <select
                id="class_of_business"
                value={values.class_of_business}
                onChange={(e) => set("class_of_business", e.target.value)}
              >
                <option value="">— Select —</option>
                {/* A saved class that is in neither list (older free-text data) stays selectable. */}
                {values.class_of_business && opts && !opts.classes.includes(values.class_of_business) && (
                  <option value={values.class_of_business}>{values.class_of_business}</option>
                )}
                <optgroup label="Motor">
                  {opts?.motorClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Non-motor">
                  {opts?.nonMotorClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Life">
                  {opts?.lifeClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <option value="Other">Other</option>
              </select>
            </div>
            {values.class_of_business === "Other" && (
              <div className="field">
                <label htmlFor="class_of_business_other">Specify class</label>
                <input
                  id="class_of_business_other"
                  value={values.class_of_business_other}
                  onChange={(e) => set("class_of_business_other", e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="business_type">Business type</label>
              <select id="business_type" value={values.business_type} onChange={(e) => set("business_type", e.target.value)}>
                <option value="">— Select —</option>
                {opts?.businessTypes.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="policy_no">Policy no</label>
              <input id="policy_no" value={values.policy_no} onChange={(e) => set("policy_no", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="slip_no">Slip no</label>
              <input id="slip_no" value={values.slip_no} onChange={(e) => set("slip_no", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="debit_note_no">Debit note no</label>
              <input
                id="debit_note_no"
                value={values.debit_note_no}
                onChange={(e) => set("debit_note_no", e.target.value)}
                placeholder={isEdit ? "" : "Next DB number if left blank"}
              />
            </div>
            <div className="field">
              <label htmlFor="billing_mode">Billing</label>
              <select id="billing_mode" value={values.billing_mode} onChange={(e) => set("billing_mode", e.target.value)}>
                {!isEdit && <option value="">Insurer's default</option>}
                {(opts?.billingModes ?? ["Agency", "Direct"]).map((m) => (
                  <option key={m} value={m}>
                    {m === "Agency" ? "Agency Bill (we collect the premium)" : "Direct Bill (insurer collects the premium)"}
                  </option>
                ))}
              </select>
            </div>
            {values.billing_mode !== "Direct" && (
              <div className="field">
                <label htmlFor="payment_due_date">Premium due by</label>
                <input
                  id="payment_due_date"
                  type="date"
                  value={values.payment_due_date}
                  onChange={(e) => set("payment_due_date", e.target.value)}
                />
                {!values.payment_due_date && <small>Defaults to 30 days after the transaction date.</small>}
              </div>
            )}
            <div className="field">
              <label htmlFor="start_date">Start date</label>
              <input id="start_date" type="date" value={values.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="end_date">End date</label>
              <input id="end_date" type="date" value={values.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="producer">Producer</label>
              <input id="producer" list="producer-options" value={values.producer} onChange={(e) => set("producer", e.target.value)} />
              <datalist id="producer-options">
                {opts?.producers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          {values.class_of_business && (
            <>
              {showItemTable && (
                <RiskSchedule
                  kind={riskKind}
                  rows={schedules[riskKind]}
                  onChange={(rows) => setSchedules((prev) => ({ ...prev, [riskKind]: rows }))}
                  propertyCategories={opts?.propertyCategories ?? []}
                  categorySchedules={opts?.propertyCategorySchedules}
                />
              )}
              <ScheduleSwitcher
                classOfBusiness={values.class_of_business}
                value={riskSchedule}
                onChange={(next) => {
                  setRiskSchedule(next);
                  setScheduleTouched(true);
                  setScheduleErrors({});
                }}
                errors={scheduleErrors}
              />
              {isMotor && (
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="tppd_limit">Third-party property damage (TPPD) limit</label>
                    <input id="tppd_limit" type="number" step="0.01" value={values.tppd_limit} onChange={(e) => set("tppd_limit", e.target.value)} />
                    <small>Statutory minimum: ₦3,000,000 private motor and motorcycle, ₦5,000,000 commercial.</small>
                  </div>
                </div>
              )}
              {scheduleTotal === 0 && (
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="sum_insured">Sum insured (used when the schedule has no values)</label>
                    <input id="sum_insured" type="number" step="0.01" value={values.sum_insured} onChange={(e) => set("sum_insured", e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="section-title">Financials</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="annual_premium_due">Annual premium due</label>
              <input
                id="annual_premium_due"
                type="number"
                step="0.01"
                value={values.annual_premium_due}
                onChange={(e) => set("annual_premium_due", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="proportion">Proportion</label>
              <input id="proportion" type="number" step="any" min="0" max="1" value={values.proportion} onChange={(e) => set("proportion", e.target.value)} />
              <small>This insurer's share as a fraction (0.25 = 25%). Co-insurers on one debit note must total 1.</small>
            </div>
            <div className="field">
              <label htmlFor="premium_due">Premium due</label>
              <input id="premium_due" type="number" step="0.01" value={values.premium_due} onChange={(e) => set("premium_due", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="commission_rate">Commission rate</label>
              <input
                id="commission_rate"
                type="number"
                step="0.01"
                value={values.commission_rate}
                onChange={(e) => setCommissionRate(e.target.value)}
              />
              {effectiveClass && rateDefault.data && (rateDefault.data.percent != null || rateDefault.data.cap) && (
                <small>
                  {rateDefault.data.percent != null && <>Default for this class: {rateDefault.data.percent}% ({rateDefault.data.percent / 100}). </>}
                  {rateDefault.data.cap && <>NAICOM cap: {rateDefault.data.cap.percent}%.</>}
                  {rateDefault.data.cap && (parseFloat(values.commission_rate) || 0) * 100 > rateDefault.data.cap.percent + 1e-9 && (
                    <strong style={{ color: "var(--status-critical)" }}> This rate is above the cap.</strong>
                  )}
                </small>
              )}
            </div>
            <div className="field">
              <label htmlFor="brokerage">Brokerage</label>
              <input id="brokerage" type="number" step="0.01" value={values.brokerage} onChange={(e) => set("brokerage", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="co_brokers">Co-brokers</label>
              <input id="co_brokers" type="number" step="0.01" value={values.co_brokers} onChange={(e) => set("co_brokers", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="total_brokerage_preview">Total brokerage (auto)</label>
              <input id="total_brokerage_preview" disabled value={totalBrokerage.toFixed(2)} />
            </div>
            <div className="field">
              <label htmlFor="net_premium_preview">Net premium (auto)</label>
              <input id="net_premium_preview" disabled value={netPremium.toFixed(2)} />
            </div>
            <div className="field">
              <label htmlFor="premium_paid">Premium paid</label>
              <input id="premium_paid" type="number" step="0.01" value={values.premium_paid} onChange={(e) => set("premium_paid", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="receipt_no">Receipt no</label>
              <input id="receipt_no" value={values.receipt_no} onChange={(e) => set("receipt_no", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="date_of_payment">Date of payment</label>
              <input
                id="date_of_payment"
                type="date"
                value={values.date_of_payment}
                onChange={(e) => set("date_of_payment", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={values.status}
                onChange={(e) => {
                  const next = e.target.value;
                  const wasPaid = values.status === "Paid";
                  set("status", next);
                  if (isEdit && next === "Paid" && !wasPaid) {
                    setShowReceiptPrompt(true);
                  }
                }}
              >
                {(opts?.statuses || ["Unpaid", "Paid", "Cancelled"]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Auto-derived as Paid/Unpaid from premium paid vs. premium due, unless set to Cancelled.
              </span>
            </div>
            <div className="field">
              <label htmlFor="commission_earned">Commission earned</label>
              <input
                id="commission_earned"
                type="number"
                step="0.01"
                placeholder="Defaults to total brokerage"
                value={values.commission_earned}
                onChange={(e) => set("commission_earned", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="deferred_commission">Deferred commission</label>
              <input
                id="deferred_commission"
                type="number"
                step="0.01"
                value={values.deferred_commission}
                onChange={(e) => set("deferred_commission", e.target.value)}
              />
            </div>
          </div>

          <div className="section-title">Other</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="subject_matter">Subject matter</label>
              <input id="subject_matter" value={values.subject_matter} onChange={(e) => set("subject_matter", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="proforma_inv">Proforma invoice</label>
              <input id="proforma_inv" value={values.proforma_inv} onChange={(e) => set("proforma_inv", e.target.value)} />
            </div>
            <div className="field span-3">
              <label htmlFor="transaction_narration">Narration</label>
              <textarea
                id="transaction_narration"
                rows={3}
                value={values.transaction_narration}
                onChange={(e) => set("transaction_narration", e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create transaction"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
