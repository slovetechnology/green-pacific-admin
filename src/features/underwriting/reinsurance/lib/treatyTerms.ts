import { minorDecimal, percentToBps, type Commission, type Reinstatement, type TreatyTerms } from "./reinsurance";

// "27.5" -> 2750; "" -> null; "0" -> 0; anything else invalid -> NaN.
export const looseBps = (text: string): number | null => {
  const t = text.trim();
  if (t === "") return null;
  if (/^0(\.0{1,2})?$/.test(t)) return 0;
  return percentToBps(t) ?? NaN;
};
const bpsText = (bps: number | null | undefined) => (bps === null || bps === undefined ? "" : (bps / 100).toFixed(2));

export interface TermsState {
  name: string; cedant_party_id: string; treaty_type: string; basis: string; treaty_year: string; period_start: string; period_end: string; currency: string;
  class_of_business: string; sub_classes: string; territorial_scope: string; original_inception_scope: string;
  retention: string; limit: string; lines_count: string; cession: string; ceding_commission: string; brokerage: string; brokerage_deducted_from: string;
  epi: string; mdp: string; min_premium: string; rate_on_spi: string; premium_payment_warranty_days: string; no_premium_no_cover: boolean; exclusions: string; special_conditions: string;
  commissionType: "none" | "flat" | "sliding"; flatRate: string; provisional: string; minC: string; maxC: string;
  bands: { from: string; to: string; commission: string }[];
  profit: boolean; profitShare: string; mgmtExpense: string; carryYears: string;
  reinstatements: { premium: string; basis: Reinstatement["basis"] }[];
}

export const emptyTerms = (): TermsState => ({
  name: "", cedant_party_id: "", treaty_type: "Quota Share", basis: "Risks Attaching", treaty_year: "", period_start: "", period_end: "", currency: "NGN",
  class_of_business: "", sub_classes: "", territorial_scope: "", original_inception_scope: "", retention: "", limit: "", lines_count: "", cession: "", ceding_commission: "",
  brokerage: "", brokerage_deducted_from: "", epi: "", mdp: "", min_premium: "", rate_on_spi: "", premium_payment_warranty_days: "", no_premium_no_cover: false, exclusions: "", special_conditions: "",
  commissionType: "none", flatRate: "", provisional: "", minC: "", maxC: "", bands: [{ from: "0", to: "", commission: "" }], profit: false, profitShare: "", mgmtExpense: "0", carryYears: "0", reinstatements: [],
});

export function termsFrom(t: TreatyTerms & { commission: Commission; reinstatements: Reinstatement[] }): TermsState {
  const c = t.commission;
  return {
    ...emptyTerms(), name: t.name, cedant_party_id: String(t.cedant_party_id), treaty_type: t.treaty_type, basis: t.basis, treaty_year: String(t.treaty_year),
    period_start: t.period_start, period_end: t.period_end, currency: t.currency, class_of_business: t.class_of_business || "", sub_classes: t.sub_classes.join(", "),
    territorial_scope: t.territorial_scope || "", original_inception_scope: t.original_inception_scope || "", retention: minorDecimal(t.retention_minor), limit: minorDecimal(t.limit_minor),
    lines_count: t.lines_count ? String(t.lines_count) : "", cession: bpsText(t.cession_bps), ceding_commission: bpsText(t.ceding_commission_bps), brokerage: bpsText(t.brokerage_bps),
    brokerage_deducted_from: t.brokerage_deducted_from || "", epi: minorDecimal(t.epi_minor), mdp: minorDecimal(t.mdp_minor), min_premium: minorDecimal(t.min_premium_minor),
    rate_on_spi: bpsText(t.rate_on_spi_bps), premium_payment_warranty_days: t.premium_payment_warranty_days ? String(t.premium_payment_warranty_days) : "", no_premium_no_cover: Boolean(t.no_premium_no_cover),
    exclusions: t.exclusions || "", special_conditions: t.special_conditions || "",
    commissionType: c.type, flatRate: bpsText(c.flat?.rate_bps), provisional: bpsText(c.sliding?.provisional_bps), minC: bpsText(c.sliding?.min_bps), maxC: bpsText(c.sliding?.max_bps),
    bands: c.sliding ? c.sliding.bands.map((b) => ({ from: bpsText(b.lr_from_bps), to: bpsText(b.lr_to_bps), commission: bpsText(b.commission_bps) })) : emptyTerms().bands,
    profit: Boolean(c.profit), profitShare: bpsText(c.profit?.share_bps), mgmtExpense: bpsText(c.profit?.management_expense_bps ?? 0), carryYears: String(c.profit?.deficit_carry_forward_years ?? 0),
    reinstatements: t.reinstatements.map((r) => ({ premium: bpsText(r.premium_bps), basis: r.basis })),
  };
}

// Turns the form into the API payload; returns an error message instead if a
// percentage doesn't parse. `creating` also sends the fields fixed at creation.
export function termsPayload(s: TermsState, creating: boolean): { body?: Record<string, unknown>; error?: string } {
  const pct = (text: string, label: string): { v: number | null; err?: string } => {
    const v = looseBps(text);
    return Number.isNaN(v) ? { v: null, err: `${label} must be a percentage such as 27.5.` } : { v };
  };
  const checks: [string, string][] = [["cession", "Cession"], ["ceding_commission", "Ceding commission"], ["brokerage", "Brokerage"], ["rate_on_spi", "Rate on subject premium"]];
  const parsed: Record<string, number | null> = {};
  for (const [k, label] of checks) {
    const r = pct(s[k as keyof TermsState] as string, label);
    if (r.err) return { error: r.err };
    parsed[k] = r.v;
  }
  let commission: Record<string, unknown> = { type: s.commissionType };
  if (s.commissionType === "flat") {
    const r = pct(s.flatRate, "Flat commission");
    if (r.err || r.v === null) return { error: r.err || "Enter the flat commission." };
    commission = { type: "flat", flat: { rate_bps: r.v } };
  } else if (s.commissionType === "sliding") {
    const [prov, min, max] = [pct(s.provisional, "Provisional commission"), pct(s.minC, "Minimum commission"), pct(s.maxC, "Maximum commission")];
    for (const r of [prov, min, max]) if (r.err || r.v === null) return { error: r.err || "Enter the provisional, minimum and maximum commission." };
    const bands = [];
    for (let i = 0; i < s.bands.length; i++) {
      const b = s.bands[i];
      const from = pct(b.from, `Band ${i + 1} start`), to = pct(b.to, `Band ${i + 1} end`), com = pct(b.commission, `Band ${i + 1} commission`);
      for (const r of [from, to, com]) if (r.err) return { error: r.err };
      if (from.v === null || com.v === null) return { error: `Band ${i + 1} needs a start and a commission.` };
      bands.push({ lr_from_bps: from.v, lr_to_bps: to.v, commission_bps: com.v });
    }
    commission = { type: "sliding", sliding: { provisional_bps: prov.v, min_bps: min.v, max_bps: max.v, bands } };
  }
  if (s.profit) {
    const share = pct(s.profitShare, "Profit commission share"), mgmt = pct(s.mgmtExpense, "Management expense");
    if (share.err || share.v === null) return { error: share.err || "Enter the profit commission share." };
    if (mgmt.err) return { error: mgmt.err };
    commission.profit = { share_bps: share.v, management_expense_bps: mgmt.v ?? 0, deficit_carry_forward_years: Number(s.carryYears) || 0 };
  }
  const reinstatements = [];
  for (let i = 0; i < s.reinstatements.length; i++) {
    const r = pct(s.reinstatements[i].premium, `Reinstatement ${i + 1}`);
    if (r.err || r.v === null) return { error: r.err || `Enter the additional premium for reinstatement ${i + 1}.` };
    reinstatements.push({ premium_bps: r.v, basis: s.reinstatements[i].basis });
  }
  const body: Record<string, unknown> = {
    name: s.name, treaty_type: s.treaty_type, basis: s.basis, period_start: s.period_start, period_end: s.period_end, class_of_business: s.class_of_business,
    sub_classes: s.sub_classes, territorial_scope: s.territorial_scope, original_inception_scope: s.original_inception_scope, retention: s.retention, limit: s.limit,
    lines_count: s.lines_count, cession_bps: parsed.cession, ceding_commission_bps: parsed.ceding_commission, brokerage_bps: parsed.brokerage, brokerage_deducted_from: s.brokerage_deducted_from,
    epi: s.epi, mdp: s.mdp, min_premium: s.min_premium, rate_on_spi_bps: parsed.rate_on_spi, premium_payment_warranty_days: s.premium_payment_warranty_days,
    no_premium_no_cover: s.no_premium_no_cover, exclusions: s.exclusions, special_conditions: s.special_conditions, commission, reinstatements,
  };
  if (s.treaty_year) body.treaty_year = Number(s.treaty_year);
  if (creating) { body.cedant_party_id = Number(s.cedant_party_id); body.currency = s.currency; }
  return { body };
}
