import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RenewsPolicyField } from "../components/RenewsPolicyField";
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
  currency: string;
  fx_rate: string;
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
  cancellation_reason: string;
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
  currency: "NGN",
  fx_rate: "",
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
  cancellation_reason: "",
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

// Co-insurance (backend coinsurance.js): when the insurer takes less than 100% of a new risk, the other insurers
// are entered here and each gets its own transaction and credit note on the same debit note.
interface CoInsurerRow {
  _k: number;
  // Set for a co-insurer already saved (its own transaction); blank for one being added.
  id?: number;
  credit_note_no?: string | null;
  insurer_name: string;
  proportion: string;
  sum_insured: string;
  premium_due: string;
}
let coKey = 0;
const newCoInsurer = (): CoInsurerRow => ({ _k: ++coKey, insurer_name: "", proportion: "", sum_insured: "", premium_due: "" });
const PPM = 1_000_000;
const ppm = (v: string) => Math.round((parseFloat(v) || 0) * PPM);
const kobo = (v: string | number) => Math.round((typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "")) || 0) * 100);
const naira = (k: number) => (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shareOf = (total: string, proportion: string) => (kobo(total) * (parseFloat(proportion) || 0)) / 100;
const asMoney = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

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
  // The status the transaction was loaded with: a reason is asked for only when it is being cancelled now.
  const [savedStatus, setSavedStatus] = useState("");
  const [coInsurers, setCoInsurers] = useState<CoInsurerRow[]>([newCoInsurer()]);
  // Which policy a new Renewal renews: an id, "none" (not on file) or "" (not chosen yet).
  const [renewsId, setRenewsId] = useState("");
  const [coTotals, setCoTotals] = useState({ sum_insured: "", premium: "" });
  const [leadShareSi, setLeadShareSi] = useState("");
  // Adding a late co-insurer to a placement whose other insurers are already on file under this debit note.
  const [coAlreadyRecorded, setCoAlreadyRecorded] = useState(false);
  // On an edit, co-insurers are sent (and the placement re-saved) only once something in that section changed.
  const [coTouched, setCoTouched] = useState(false);
  const [savedCoinsurers, setSavedCoinsurers] = useState(0);
  const [isNote, setIsNote] = useState(false);
  const cancelling = values.status === "Cancelled" && savedStatus !== "Cancelled";

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
      setSavedStatus(String(t.status ?? ""));
      setIsNote(Boolean(t.parent_transaction_id));
      const peers = (editQuery.data as { coinsurers?: { id: number; insurer_name: string | null; credit_note_no: string | null; proportion: number; sum_insured: number; premium_due: number }[] }).coinsurers ?? [];
      setSavedCoinsurers(peers.length);
      setCoTouched(false);
      setLeadShareSi(num(t.sum_insured));
      if (peers.length) {
        setCoInsurers(peers.map((p) => ({ _k: ++coKey, id: p.id, credit_note_no: p.credit_note_no, insurer_name: p.insurer_name ?? "", proportion: String(p.proportion), sum_insured: String(p.sum_insured ?? 0), premium_due: String(p.premium_due ?? 0) })));
        // The 100% figures are what the placement adds up to now.
        const total = (own: unknown, key: "sum_insured" | "premium_due") => asMoney(Number(own ?? 0) + peers.reduce((acc, p) => acc + Number(p[key] || 0), 0));
        setCoTotals({ sum_insured: total(t.sum_insured, "sum_insured"), premium: total(t.premium_due, "premium_due") });
      } else {
        setCoInsurers([newCoInsurer()]);
        setCoTotals({ sum_insured: "", premium: "" });
      }
      // A foreign policy (G8) is edited in its own currency: the stored naira figures are at its booked rate.
      const foreign = Boolean(t.currency) && t.currency !== "NGN";
      const amt = (key: string) => (foreign ? num(t[`${key}_fc`]) : num(t[key]));
      setValues((prev) => ({
        ...prev,
        currency: String(t.currency ?? "NGN"),
        fx_rate: foreign ? num(t.fx_rate) : "",
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
        sum_insured: amt("sum_insured"),
        tppd_limit: t.tppd_limit === null || t.tppd_limit === undefined ? "" : String(t.tppd_limit),
        annual_premium_due: amt("annual_premium_due"),
        start_date: String(t.start_date ?? ""),
        end_date: String(t.end_date ?? ""),
        proportion: num(t.proportion) || "1",
        premium_due: amt("premium_due"),
        commission_rate: num(t.commission_rate),
        brokerage: amt("brokerage"),
        co_brokers: amt("co_brokers") || "0",
        premium_paid: foreign ? num(Math.round((Number(t.premium_paid) / Number(t.fx_rate)) * 100) / 100) : num(t.premium_paid),
        receipt_no: String(t.receipt_no ?? ""),
        status: String(t.status ?? "Unpaid"),
        cancellation_reason: "",
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


  function coinsuranceProblems(): string[] {
    const out: string[] = [];
    if (leavingCoinsurance) return out;
    if (!coInsurers.length) out.push("Add at least one co-insurer.");
    if (!(kobo(coTotalPrem) > 0)) out.push("Enter the premium: the lead insurer's share, or the total premium (100%).");
    const names = [values.insurer_name, ...coInsurers.map((c) => c.insurer_name)].map((x) => x.trim().toLowerCase());
    if (names.some((x) => !x)) out.push("Enter every co-insurer's name.");
    else if (new Set(names).size !== names.length) out.push("Each insurer can appear only once.");
    if (coRows.some((c) => ppm(c.proportion) <= 0 || ppm(c.proportion) >= PPM)) out.push("Each co-insurer's share must be above 0 and below 1.");
    if (coSharesPpm !== PPM) out.push(`The shares total ${coSharesPpm / 10000}%; they must total 100%.`);
    if (coSiKobo !== kobo(coTotalSi)) out.push(`The shares of the sum insured add up to ₦${naira(coSiKobo)}, not ₦${naira(kobo(coTotalSi))}.`);
    if (kobo(coTotalPrem) > 0 && coPremKobo !== kobo(coTotalPrem)) out.push(`The shares of the premium add up to ₦${naira(coPremKobo)}, not ₦${naira(kobo(coTotalPrem))}.`);
    return out;
  }

  // Fills every insurer's sum insured and premium from the 100% figures and its share; any kobo left over by
  // rounding goes to the lead insurer, so the shares add up to the totals exactly.
  function splitByShares() {
    setCoTouched(true);
    const followers = coRows.map((c) => ({ ...c, sum_insured: asMoney(shareOf(coSiBasis, c.proportion)), premium_due: asMoney(shareOf(coPremBasis, c.proportion)) }));
    const leadSi = (kobo(coSiBasis) - followers.reduce((sum, c) => sum + kobo(c.sum_insured), 0)) / 100;
    const leadPrem = (kobo(coPremBasis) - followers.reduce((sum, c) => sum + kobo(c.premium_due), 0)) / 100;
    setCoInsurers(followers);
    setLeadShareSi(asMoney(leadSi));
    setValues((prev) => {
      const rate = parseFloat(prev.commission_rate) || 0;
      return { ...prev, premium_due: asMoney(leadPrem), brokerage: rate ? asMoney(leadPrem * rate) : prev.brokerage };
    });
  }

  // The insurers on file not already in this placement (the lead and the other co-insurers), for a co-insurer's picker.
  function insurersFree(k: number): string[] {
    const taken = new Set([values.insurer_name, ...coInsurers.filter((c) => c._k !== k).map((c) => c.insurer_name)].map((x) => x.trim().toLowerCase()));
    return (opts?.insurers ?? []).filter((name) => !taken.has(name.trim().toLowerCase()));
  }

  // A typed co-insurer name completed to the insurer on file it means: the same name in any case, else the only
  // insurer whose name starts with, then contains, what was typed (spaces and punctuation ignored).
  function matchInsurer(typed: string, k: number): string | null {
    const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
    const want = squash(typed);
    if (!want) return null;
    const pool = insurersFree(k);
    const exact = pool.find((name) => squash(name) === want);
    if (exact) return exact;
    const starts = pool.filter((name) => squash(name).startsWith(want));
    if (starts.length === 1) return starts[0];
    const contains = pool.filter((name) => squash(name).includes(want));
    return contains.length === 1 ? contains[0] : null;
  }

  function confirmRemove(c: CoInsurerRow) {
    return window.confirm(`Remove ${c.insurer_name || "this co-insurer"} from the placement? Its transaction ${c.credit_note_no || ""} will be cancelled when you save.`);
  }

  function setCoInsurer(k: number, patch: Partial<CoInsurerRow>) {
    setCoTouched(true);
    setCoInsurers((rows) =>
      rows.map((r) => {
        if (r._k !== k) return r;
        const next = { ...r, ...patch };
        // Typing a share fills that insurer's sum insured and premium from the totals.
        if (patch.proportion !== undefined) {
          if (kobo(coSiBasis) > 0) next.sum_insured = asMoney(shareOf(coSiBasis, patch.proportion));
          if (kobo(coPremBasis) > 0) next.premium_due = asMoney(shareOf(coPremBasis, patch.proportion));
        }
        return next;
      })
    );
  }

  async function handleSubmit(e: FormEvent, withOverride = false) {
    e.preventDefault();
    setError(null);
    if (enteringCoinsurers) {
      const problems = coinsuranceProblems();
      if (problems.length) {
        setError(`Co-insurance: ${problems.join(" ")}`);
        document.getElementById("coinsurance-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
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
    if (cancelling && !values.cancellation_reason.trim()) {
      setError("Give the reason for cancelling this transaction.");
      return;
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
      // A co-insured row carries its own share of the sum insured, not the schedule's 100% total.
      ...(isEdit && showCoinsurance && !leavingCoinsurance ? { sum_insured: leadSiValue } : {}),
      // Co-insurers entered or changed: the server saves one row per insurer.
      ...(enteringCoinsurers
        ? {
            ...(leavingCoinsurance ? {} : { sum_insured: leadSiValue }),
            coinsurance_total_sum_insured: coTotalSi,
            coinsurance_total_premium: coTotalPrem,
            co_insurers: coRows.map(({ _k, credit_note_no, ...c }) => {
              void _k;
              void credit_note_no;
              return c;
            }),
          }
        : {}),
    };
    const withRenewal = !isEdit && values.business_type === "Renewal" && renewsId ? { ...payload, renews_transaction_id: renewsId } : payload;
    const body = withOverride ? { ...withRenewal, compliance_override_reason: overrideReason } : withRenewal;
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

  const leadPpm = ppm(values.proportion);
  const showCoinsurance = isEdit ? !isNote && leadPpm > 0 && (leadPpm < PPM || savedCoinsurers > 0) : leadPpm > 0 && leadPpm < PPM;
  const enteringCoinsurers = showCoinsurance && (isEdit ? coTouched : !coAlreadyRecorded);
  // Back to 100% with every co-insurer removed: the transaction leaves co-insurance (edit only).
  const leavingCoinsurance = isEdit && leadPpm === PPM && coInsurers.length === 0;
  // A co-insurer whose share is left blank takes what the lead and the typed shares leave of 100%, shared
  // equally when several are blank (any part per million left over goes to the first).
  const coBlankShares = coInsurers.filter((c) => c.proportion.trim() === "").length;
  const coShareLeftPpm = Math.max(0, PPM - leadPpm - coInsurers.reduce((sum, c) => sum + (c.proportion.trim() === "" ? 0 : ppm(c.proportion)), 0));
  let coBlankSeen = 0;
  const coShares = coInsurers.map((c) => {
    if (c.proportion.trim() !== "") return c.proportion;
    const each = Math.floor(coShareLeftPpm / coBlankShares);
    const share = each + (coBlankSeen++ === 0 ? coShareLeftPpm - each * coBlankShares : 0);
    return String(share / PPM);
  });
  const coSharesPpm = leadPpm + coShares.reduce((sum, x) => sum + ppm(x), 0);
  // The 100% sum insured a blank share is taken from: as typed, else the risk schedule's total (which lists the
  // whole risk), else the lead's share grossed up by the lead's share of the risk, else 0 (no sum insured).
  const coSiFixed = coTotals.sum_insured.trim() !== "" ? coTotals.sum_insured : scheduleTotal > 0 ? String(scheduleTotal) : "";
  const coSiBasis = coSiFixed !== "" ? coSiFixed : leadShareSi.trim() !== "" && leadPpm > 0 ? asMoney((kobo(leadShareSi) * PPM) / leadPpm / 100) : "0";
  // The 100% premium a co-insurer's blank premium is taken from: as typed, else the lead's premium grossed up by
  // its share (the lead's premium is its share of the whole).
  const coPremBasis = coTotals.premium.trim() !== "" ? coTotals.premium : leadPpm > 0 ? asMoney((kobo(values.premium_due) * PPM) / leadPpm / 100) : "0";
  // Each co-insurer as it will be saved: a blank sum insured or premium is its share of the 100% figure.
  const coRows = coInsurers.map((c, i) => ({
    ...c,
    proportion: coShares[i],
    sum_insured: c.sum_insured.trim() !== "" ? c.sum_insured : asMoney(shareOf(coSiBasis, coShares[i])),
    premium_due: c.premium_due.trim() !== "" ? c.premium_due : asMoney(shareOf(coPremBasis, coShares[i])),
  }));
  const coFollowersSiKobo = coRows.reduce((sum, c) => sum + kobo(c.sum_insured), 0);
  // The lead's share, left blank, is what the co-insurers' shares leave of the total.
  const leadSiValue = leadShareSi.trim() !== "" ? leadShareSi : asMoney(Math.max(0, kobo(coSiBasis) - coFollowersSiKobo) / 100);
  const coSiKobo = kobo(leadSiValue) + coFollowersSiKobo;
  // The 100% sum insured: as typed or the schedule's total, else what every insurer's share of it adds up to.
  const coTotalSi = coSiFixed !== "" ? coSiFixed : asMoney(coSiKobo / 100);
  const coPremKobo = kobo(values.premium_due) + coRows.reduce((sum, c) => sum + kobo(c.premium_due), 0);
  // The 100% premium: as typed, else what every insurer's share of it adds up to.
  const coTotalPrem = coTotals.premium.trim() !== "" ? coTotals.premium : asMoney(coPremKobo / 100);

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
            {!isEdit && values.business_type === "Renewal" && (
              <RenewsPolicyField
                clientName={values.client_name}
                policyNo={values.policy_no}
                classOfBusiness={values.class_of_business}
                insurerName={values.insurer_name}
                startDate={values.start_date}
                value={renewsId}
                onChange={setRenewsId}
              />
            )}
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
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select id="currency" value={values.currency} onChange={(e) => set("currency", e.target.value)} disabled={isNote}>
                {["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c} value={c}>{c === "NGN" ? "Naira (NGN)" : c}</option>)}
              </select>
            </div>
            {values.currency !== "NGN" && (
              <div className="field">
                <label htmlFor="fx_rate">Exchange rate (NGN per {values.currency})</label>
                <input id="fx_rate" inputMode="decimal" value={values.fx_rate} onChange={(e) => set("fx_rate", e.target.value)} placeholder="Blank: the CBN rate on the transaction date" disabled={isNote} />
                <small className="text-muted">Amounts below are in {values.currency}; the policy is booked in naira at this rate.</small>
              </div>
            )}
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
              {scheduleTotal === 0 && !(isEdit ? showCoinsurance : enteringCoinsurers) && (
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
              <input id="proportion" type="number" step="any" min="0" max="1" value={values.proportion} onChange={(e) => {
                  set("proportion", e.target.value);
                  if (isEdit) setCoTouched(true);
                }} />
              <small>This insurer's share as a fraction (0.25 = 25%). Below 1, the co-insurers are asked for below.</small>
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
            {cancelling && (
              <div className="field">
                <label htmlFor="cancellation_reason">Reason for cancellation *</label>
                <textarea
                  id="cancellation_reason"
                  rows={2}
                  required
                  maxLength={1000}
                  value={values.cancellation_reason}
                  onChange={(e) => set("cancellation_reason", e.target.value)}
                  placeholder="e.g. Client instructed cancellation: vehicle sold"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Shown on the policy history and the Cancelled Transactions report. The premium and commission stop counting as income.
                </span>
              </div>
            )}
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

          {showCoinsurance && (
            <>
              <div className="section-title" id="coinsurance-section">Co-insurance</div>
              <p className="page-lede">
                {values.insurer_name || "This insurer"} takes {leadPpm / 10000}% of the risk. {isEdit ? "The other insurers are below: change a share or amount, add an insurer, or remove one." : "Enter the other insurers' shares:"} Each
                insurer has its own transaction and credit note number, all on one debit note. The shares must total 100%, and the shares of the sum
                insured and premium must add up to the totals.
              </p>
              {isEdit && !coTouched && (
                <p><small>Nothing here has changed, so saving leaves the co-insurers as they are.</small></p>
              )}
              {!isEdit && (
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <input type="checkbox" checked={coAlreadyRecorded} onChange={(e) => setCoAlreadyRecorded(e.target.checked)} />
                  The other insurers are already recorded under this client and debit note number
                </label>
              )}
              {!coAlreadyRecorded && (
                <>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="co_total_si">Total sum insured (100%)</label>
                      <input
                        id="co_total_si"
                        type="number"
                        step="0.01"
                        placeholder={scheduleTotal > 0 ? `${naira(kobo(scheduleTotal))} (the schedule total)` : kobo(coTotalSi) > 0 ? `${naira(kobo(coTotalSi))} (the shares added up)` : "Filled from the shares below"}
                        value={coTotals.sum_insured}
                        onChange={(e) => {
                          setCoTouched(true);
                          setCoTotals((t) => ({ ...t, sum_insured: e.target.value }));
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="co_total_premium">Total premium (100%)</label>
                      <input id="co_total_premium" type="number" step="0.01" placeholder={kobo(coTotalPrem) > 0 ? `${naira(kobo(coTotalPrem))} (the shares added up)` : "Filled from the premiums below"} value={coTotals.premium} onChange={(e) => {
                        setCoTouched(true);
                        setCoTotals((t) => ({ ...t, premium: e.target.value }));
                      }} />
                    </div>
                    <div className="field" style={{ alignSelf: "end" }}>
                      <button type="button" className="btn-secondary btn" onClick={splitByShares} disabled={kobo(coSiBasis) === 0 && kobo(coPremBasis) === 0}>
                        Split the totals by share
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Insurer</th>
                          <th>Share (fraction)</th>
                          <th>Share of sum insured</th>
                          <th>Share of premium</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td data-label="Insurer"><strong>{values.insurer_name || "Lead insurer"}</strong> (lead)</td>
                          <td data-label="Share">{values.proportion}</td>
                          <td data-label="Share of sum insured">
                            <input type="number" step="0.01" aria-label="Lead insurer's share of the sum insured" value={leadShareSi} placeholder={leadSiValue} onChange={(e) => {
                              setCoTouched(true);
                              setLeadShareSi(e.target.value);
                            }} />
                          </td>
                          <td data-label="Share of premium">
                            <input type="number" step="0.01" aria-label="Lead insurer's share of the premium" value={values.premium_due} onChange={(e) => {
                              if (isEdit) setCoTouched(true);
                              const premium = e.target.value;
                              // Like the co-insurers', the lead's brokerage follows its premium at the policy's rate.
                              setValues((prev) => {
                                const rate = parseFloat(prev.commission_rate) || 0;
                                return { ...prev, premium_due: premium, brokerage: rate ? asMoney((parseFloat(premium) || 0) * rate) : prev.brokerage };
                              });
                            }} />
                          </td>
                          <td />
                        </tr>
                        {coInsurers.map((c, i) => (
                          <tr key={c._k}>
                            <td data-label="Insurer">
                              <input list={`co-insurer-options-${c._k}`} aria-label={`Co-insurer ${i + 1} name`} placeholder="Start typing an insurer" value={c.insurer_name}
                                onChange={(e) => setCoInsurer(c._k, { insurer_name: e.target.value })}
                                onBlur={(e) => {
                                  const full = matchInsurer(e.target.value, c._k);
                                  if (full && full !== c.insurer_name) setCoInsurer(c._k, { insurer_name: full });
                                }} />
                              <datalist id={`co-insurer-options-${c._k}`}>
                                {insurersFree(c._k).map((name) => (
                                  <option key={name} value={name} />
                                ))}
                              </datalist>
                              {c.id && <small> {c.credit_note_no || `#${c.id}`}</small>}
                            </td>
                            <td data-label="Share">
                              <input type="number" step="any" min="0" max="1" aria-label={`Co-insurer ${i + 1} share`} value={c.proportion} placeholder={coShares[i]} onChange={(e) => setCoInsurer(c._k, { proportion: e.target.value })} />
                            </td>
                            <td data-label="Share of sum insured">
                              <input type="number" step="0.01" aria-label={`Co-insurer ${i + 1} share of the sum insured`} value={c.sum_insured} placeholder={coRows[i]?.sum_insured} onChange={(e) => setCoInsurer(c._k, { sum_insured: e.target.value })} />
                            </td>
                            <td data-label="Share of premium">
                              <input type="number" step="0.01" aria-label={`Co-insurer ${i + 1} share of the premium`} value={c.premium_due} placeholder={coRows[i]?.premium_due} onChange={(e) => setCoInsurer(c._k, { premium_due: e.target.value })} />
                            </td>
                            <td>
                              <button type="button" className="btn-secondary btn btn-sm" disabled={!isEdit && coInsurers.length === 1}
                                onClick={() => {
                                  if (c.id && !confirmRemove(c)) return;
                                  setCoTouched(true);
                                  setCoInsurers((rows) => rows.filter((r) => r._k !== c._k));
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td data-label="Total"><strong>Total</strong></td>
                          <td data-label="Shares" style={{ color: coSharesPpm === PPM ? "var(--status-good)" : "var(--status-critical)" }}>{coSharesPpm / 10000}%</td>
                          <td data-label="Sum insured" style={{ color: coSiKobo === kobo(coTotalSi) ? "var(--status-good)" : "var(--status-critical)" }}>
                            ₦{naira(coSiKobo)}
                            {coSiKobo !== kobo(coTotalSi) && <small> (total is ₦{naira(kobo(coTotalSi))})</small>}
                          </td>
                          <td data-label="Premium" style={{ color: kobo(coTotalPrem) > 0 && coPremKobo === kobo(coTotalPrem) ? "var(--status-good)" : "var(--status-critical)" }}>
                            ₦{naira(coPremKobo)}
                            {kobo(coTotalPrem) > 0 && coPremKobo !== kobo(coTotalPrem) && <small> (total is ₦{naira(kobo(coTotalPrem))})</small>}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => {
                    setCoTouched(true);
                    setCoInsurers((rows) => [...rows, newCoInsurer()]);
                  }}>
                    Add co-insurer
                  </button>
                  <p><small>
                    Each co-insurer's brokerage is its premium at this policy's commission rate. Its debit note, dates, class and risk schedule are this transaction's.
                    {isEdit && " Removing a saved co-insurer cancels its transaction (its credit note and payments stay on file). To take this transaction out of co-insurance, set its share to 1 and remove every co-insurer."}
                  </small></p>
                </>
              )}
            </>
          )}

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
