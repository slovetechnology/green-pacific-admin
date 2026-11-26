// Indicative annual premium estimates, shown on the marketplace estimator and inside the Request
// for Quote form. One table of rates for every class, so a figure on the marketplace and in the form
// always agree. The exact premium comes from the insurer's quote.

import { FIRE_TARIFF, type FireTariffRow } from "./fireTariff";

export type Answers = Record<string, string | string[] | undefined>;

export type EstimateResult =
  | { kind: "range"; low: number; high: number; currency: string; basis: string; note?: string; period?: string }
  | { kind: "life"; age: number; gender: string; smoker: boolean; term: number; coverage: number }
  | { kind: "none"; reason: string }
  | { kind: "incomplete"; need: string };

// Rates are Green Pacific's Table of Premium Rates (motor, liability, transit, bonds, group life...) and,
// for fire, the PRAN / FOC Fire Underwriting & Pricing Manual (fireTariff.ts), which sets minimum basic
// rates by occupation and construction class. Edit the numbers here to match current terms.

// Motor: third party is the statutory tariff per vehicle; comprehensive is a percentage of the vehicle's value.
export const MOTOR_RATES: Record<string, { thirdParty: number; comprehensivePct: number }> = {
  "Private Motor": { thirdParty: 15000, comprehensivePct: 5 },
  "Commercial Vehicle": { thirdParty: 100000, comprehensivePct: 5 },
  Motorcycle: { thirdParty: 15000, comprehensivePct: 5 },
};

// Annual rate as a percentage of the sum insured / limit (Table of Premium Rates).
export const RATE_PCT: Record<string, number> = {
  Burglary: 0.2,
  "All Risks": 1.5,
  "Public Liability": 0.075,
  "Occupiers Liability": 0.075,
  "Professional Indemnity": 0.5,
  "Health Professional Indemnity": 0.5,
  "Fidelity Guarantee": 1,
  "Group Life": 0.6,
  "Combined Group Life": 0.6,
  "Group Personal Accident": 0.15, // death 0.075% + permanent disablement 0.075%
  "Machinery Breakdown": 0.5,
  "Boiler Pressure": 0.75,
  "Bond Insurance": 1,
  "Contractors All Risks": 0.15,
  "Building Under Construction": 0.15,
  "Erection All Risks": 0.35,
  "Marine Hull": 1,
};

// Fire and the classes built on it: the occupation's basic rate plus special perils (0.075%), plus burglary
// for combined fire and burglary, plus the manual's 0.025% loading for industrial all risks.
const SPECIAL_PERILS_PCT = 0.075;
const FIRE_CLASSES: Record<string, { extraPct: number; extra?: string }> = {
  "Fire and Special Perils": { extraPct: 0 },
  "Combined Fire and Burglary": { extraPct: RATE_PCT.Burglary, extra: `burglary ${RATE_PCT.Burglary}%` },
  "Industrial All Risks": { extraPct: 0.025, extra: "the 0.025% industrial all risks loading" },
};
// Fire extinguishers throughout earn 15% off the basic rate (manual 7.0); the low end of the range allows it.
const FEA_DISCOUNT = 0.15;
const CONSTRUCTION_CLASS: Record<string, 0 | 1 | 2> = {
  "Concrete / block walls, concrete or metal roof": 0,
  "Block walls, wooden roof": 1,
  "Partly timber or other combustible materials": 2,
};

// Householder / houseowner: building (section 1) and contents (section 2).
const HOME_BUILDING_PCT = 0.1;
const HOME_CONTENTS_PCT = 0.35;

// Goods in transit: dry cargo 0.45%, wet (liquid) cargo 0.75%, on the value carried in a year.
const TRANSIT_PCT = { dry: 0.45, wet: 0.75 };

// Marine cargo, on the invoice value plus 10% (the market convention): 0.1% for all risks (Clause A) down to
// 0.05% for Clause B and 0.03% for named perils (Clause C). Exports are 0.5% whatever the clause.
const MARINE_PCT = { A: 0.1, B: 0.05, C: 0.03 };
const MARINE_EXPORT_PCT = 0.5;

// Plans priced per person or built around savings, or classes with no rate in our table.
const NO_ESTIMATE: Record<string, string> = {
  health: "Health plans are priced per person by the HMO, based on the plan and hospital list you choose.",
  travel: "Travel cover is priced by destination, trip length and the travellers' ages.",
  "Education Insurance": "Education plans are savings plans: the contribution depends on the target amount and term, so we'll send you an illustration.",
  "Leadway Savings Plan": "Savings plans depend on how much you want to save each month, so we'll send you an illustration.",
  "Livestock Insurance": "Livestock cover is priced by the insurer for each farm, after a veterinary survey.",
  "Aviation Refueling Liability": "Aviation refuelling liability is priced by the insurer for each operator.",
  "Combined Policy": "A combined policy is priced section by section, so we'll put the figures together for you.",
};

// The questions the estimator asks, per form (keys of the Request for Quote form's fields).
export const ESTIMATE_FIELDS: Record<string, string[]> = {
  motor: ["vehicle_value"],
  property: ["fire_occupation", "construction", "total_sum_insured"],
  home: ["building_value", "contents_value"],
  transit: ["annual_carry"],
  liability: ["limit_of_indemnity"],
  fidelity: ["aggregate_limit"],
  livestock: [],
  general: ["sum_insured"],
  marine: ["direction", "invoice_currency", "invoice_value", "clause"],
  group: ["number_of_staff", "benefit_basis", "annual_emoluments", "fixed_sum"],
  life: ["life_assured_age", "gender", "smoker", "sum_assured", "term_years"],
  health: [],
  travel: [],
};

/** Hide inputs that don't apply to the class or the answers so far. */
export function estimateFieldShown(key: string, answers: Answers, className = ""): boolean {
  const fixed = answers.benefit_basis === "Fixed sum per person";
  if (key === "fixed_sum") return fixed;
  if (key === "annual_emoluments") return !fixed;
  if (key === "fire_occupation" || key === "construction") return className in FIRE_CLASSES;
  if (key === "clause") return answers.direction !== "Export from Nigeria";
  return true;
}

function amount(v: string | string[] | undefined): number {
  if (typeof v !== "string") return 0;
  const n = parseFloat(v.replace(/[,\s₦]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function motorKind(className: string) {
  return Object.keys(MOTOR_RATES).find((k) => className.startsWith(k)) ?? null;
}

function pct(n: number) {
  return `${Number(n.toFixed(4))}%`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const TARIFF_BY_NAME = new Map<string, FireTariffRow[]>();
for (const row of FIRE_TARIFF) {
  const key = norm(row[0]);
  TARIFF_BY_NAME.set(key, [...(TARIFF_BY_NAME.get(key) ?? []), row]);
}
/** Occupation names for the picker, one per occupation (warranty variants share a name). */
export const FIRE_OCCUPATIONS: string[] = [...new Map(FIRE_TARIFF.map((r) => [norm(r[0]), r[0]])).values()].sort((a, b) => a.localeCompare(b));

/** The basic rate for one tariff row and construction class; where the manual gives no rate for that class,
 *  the nearest class it does rate applies (manual note to section 4.0). */
function classRate(row: FireTariffRow, cls: 0 | 1 | 2): number | null {
  const order: Record<0 | 1 | 2, (0 | 1 | 2)[]> = { 0: [0, 1, 2], 1: [1, 0, 2], 2: [2, 1, 0] };
  for (const c of order[cls]) {
    const v = row[2 + c];
    if (typeof v === "number") return v;
  }
  return null;
}

/** Lowest and highest basic rate for an occupation (warranty variants, and every class when it's unknown). */
export function fireBasicRate(occupation: string, construction?: string): { low: number; high: number; variants: number } | null {
  const rows = TARIFF_BY_NAME.get(norm(occupation));
  if (!rows) return null;
  const known = construction ? CONSTRUCTION_CLASS[construction] : undefined;
  const classes: (0 | 1 | 2)[] = known === undefined ? [0, 1, 2] : [known];
  const rates = rows.flatMap((r) => classes.map((c) => classRate(r, c))).filter((v): v is number => v !== null);
  if (!rates.length) return null;
  return { low: Math.min(...rates), high: Math.max(...rates), variants: rows.length };
}

const LIFE_TERMS = [10, 15, 20, 25, 30];

function percentOf(insured: number, low: number, high = low) {
  return { low: (insured * low) / 100, high: (insured * high) / 100 };
}

export function estimatePremium(className: string, formId: string | undefined, answers: Answers): EstimateResult | null {
  if (!className || !formId) return null;
  const noEstimate = NO_ESTIMATE[className] ?? NO_ESTIMATE[formId];
  if (noEstimate) return { kind: "none", reason: noEstimate };

  if (formId === "motor") {
    const kind = motorKind(className);
    if (!kind) return null;
    const rates = MOTOR_RATES[kind];
    const chosen = typeof answers.cover_type === "string" && answers.cover_type ? answers.cover_type : className.includes("Third Party") ? "Third Party Only" : "Comprehensive";
    if (chosen === "Third Party Only") {
      return { kind: "range", low: rates.thirdParty, high: rates.thirdParty, currency: "NGN", basis: "Third-party cover is a fixed premium set by the statutory tariff." };
    }
    if (chosen !== "Comprehensive") return { kind: "none", reason: "Third party, fire and theft is priced by the insurer for each vehicle." };
    const value = amount(answers.vehicle_value);
    if (!value) return { kind: "incomplete", need: "Enter the vehicle's value to see an estimate." };
    const premium = (value * rates.comprehensivePct) / 100;
    return {
      kind: "range", low: premium, high: premium, currency: "NGN",
      basis: `${rates.comprehensivePct}% of the vehicle's value a year.`,
      note: `Third-party only would be ₦${rates.thirdParty.toLocaleString("en-NG")} a year.`,
    };
  }

  if (formId === "marine") {
    if (!/cargo/i.test(className)) return null;
    const value = amount(answers.invoice_value);
    if (!value) return { kind: "incomplete", need: "Enter the invoice value to see an estimate." };
    const clause = typeof answers.clause === "string" ? (answers.clause.match(/\(([ABC])\)/)?.[1] as "A" | "B" | "C" | undefined) : undefined;
    const currency = typeof answers.invoice_currency === "string" && answers.invoice_currency ? answers.invoice_currency : "NGN";
    const insured = value * 1.1;
    const period = answers.cover_basis === "An open cover (all shipments for a year)" ? "a year" : "per shipment";
    if (answers.direction === "Export from Nigeria") {
      return {
        kind: "range", ...percentOf(insured, MARINE_EXPORT_PCT), currency,
        basis: `${pct(MARINE_EXPORT_PCT)} for exports, on the invoice value plus 10%.`, period,
      };
    }
    const [lowPct, highPct] = clause ? [MARINE_PCT[clause], MARINE_PCT[clause]] : [MARINE_PCT.C, MARINE_PCT.A];
    return {
      kind: "range", ...percentOf(insured, lowPct, highPct), currency,
      basis: clause
        ? `${pct(lowPct)} for Institute Cargo Clause ${clause}, on the invoice value plus 10%.`
        : `${pct(MARINE_PCT.C)} (Clause C, named perils) to ${pct(MARINE_PCT.A)} (Clause A, all risks), on the invoice value plus 10%.`,
      period,
    };
  }

  if (formId === "property" && FIRE_CLASSES[className]) {
    const extra = FIRE_CLASSES[className];
    const occupation = typeof answers.fire_occupation === "string" ? answers.fire_occupation : "";
    const insured = amount(answers.total_sum_insured);
    if (!occupation || !insured) return { kind: "incomplete", need: "Choose the occupation of the premises and enter the sum insured to see an estimate." };
    const basic = fireBasicRate(occupation, typeof answers.construction === "string" ? answers.construction : undefined);
    if (!basic) return { kind: "incomplete", need: "Pick the occupation from the list so we can find its tariff rate." };
    const added = SPECIAL_PERILS_PCT + extra.extraPct;
    const lowPct = basic.low * (1 - FEA_DISCOUNT) + added;
    const highPct = basic.high + added;
    const basicText = basic.low === basic.high ? pct(basic.low) : `${pct(basic.low)} to ${pct(basic.high)}`;
    const depends = [
      typeof answers.construction === "string" && answers.construction ? "" : "the construction",
      basic.variants > 1 ? "the warranties accepted" : "",
    ].filter(Boolean).join(" and ");
    return {
      kind: "range", ...percentOf(insured, lowPct, highPct), currency: "NGN",
      basis: `Fire tariff basic rate ${basicText}${depends && basic.low !== basic.high ? ` (depending on ${depends})` : ""}, plus special perils ${pct(SPECIAL_PERILS_PCT)}${extra.extra ? ` and ${extra.extra}` : ""}.`,
      note: "The lower figure allows the 15% discount for fire extinguishers throughout the premises.",
    };
  }

  if (formId === "home") {
    const building = amount(answers.building_value);
    const contents = amount(answers.contents_value);
    if (!building && !contents) return { kind: "incomplete", need: "Enter the value of the building, the contents, or both to see an estimate." };
    const premium = (building * HOME_BUILDING_PCT + contents * HOME_CONTENTS_PCT) / 100;
    return {
      kind: "range", low: premium, high: premium, currency: "NGN",
      basis: `${pct(HOME_BUILDING_PCT)} of the building value and ${pct(HOME_CONTENTS_PCT)} of the contents a year.`,
      note: "Jewellery and laptops away from home (all risks) are 3% to 5% of their value; mobile phones 10%.",
    };
  }

  if (formId === "transit") {
    const insured = amount(answers.annual_carry);
    if (!insured) return { kind: "incomplete", need: "Enter the value you carry in a year to see an estimate." };
    return {
      kind: "range", ...percentOf(insured, TRANSIT_PCT.dry, TRANSIT_PCT.wet), currency: "NGN",
      basis: `${pct(TRANSIT_PCT.dry)} of the value carried for dry goods, ${pct(TRANSIT_PCT.wet)} for liquids (wet cargo).`,
    };
  }

  if (formId === "group") {
    const rate = RATE_PCT[className];
    if (!rate) return null;
    const basis = typeof answers.benefit_basis === "string" ? answers.benefit_basis : "";
    let insured = 0;
    if (basis === "Fixed sum per person") insured = amount(answers.fixed_sum) * amount(answers.number_of_staff);
    else {
      const times = Number(basis.match(/^(\d+) x/)?.[1] || 0);
      insured = times * amount(answers.annual_emoluments);
    }
    if (!insured) return { kind: "incomplete", need: "Enter the number of staff, the benefit and the salaries (or fixed sum) to see an estimate." };
    const premium = (insured * rate) / 100;
    return {
      kind: "range", low: premium, high: premium, currency: "NGN",
      basis: `${pct(rate)} of the total benefit of ₦${Math.round(insured).toLocaleString("en-NG")}${className === "Group Personal Accident" ? " (death and permanent disablement; medical expenses are 0.8% of their limit)" : ""}.`,
    };
  }

  if (formId === "life") {
    const age = Math.round(amount(answers.life_assured_age));
    const coverage = amount(answers.sum_assured);
    const years = amount(answers.term_years);
    if (!age || !coverage || !years) return { kind: "incomplete", need: "Enter the age, sum assured and term to see an estimate." };
    if (age < 18 || age > 70) return { kind: "none", reason: "Online estimates are for ages 18 to 70. We'll price other ages for you." };
    const term = LIFE_TERMS.reduce((best, t) => (Math.abs(t - years) < Math.abs(best - years) ? t : best), LIFE_TERMS[0]);
    return { kind: "life", age, gender: answers.gender === "Male" ? "Male" : "Female", smoker: answers.smoker === "Yes", term, coverage };
  }

  const rate = RATE_PCT[className];
  if (!rate) return null;
  const sumKey = ESTIMATE_FIELDS[formId]?.[0];
  const insured = sumKey ? amount(answers[sumKey]) : 0;
  if (!insured) return { kind: "incomplete", need: "Enter the amount to insure to see an estimate." };
  const premium = (insured * rate) / 100;
  return { kind: "range", low: premium, high: premium, currency: "NGN", basis: `${pct(rate)} of the amount insured a year.` };
}

export function formatAmount(n: number, currency: string) {
  const rounded = n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);
  const text = rounded.toLocaleString("en-NG", { maximumFractionDigits: 0 });
  return currency === "NGN" ? `₦${text}` : `${currency} ${text}`;
}
