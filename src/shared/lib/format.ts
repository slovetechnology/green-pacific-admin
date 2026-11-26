// Ports of fmt_money / fmt_money_short (Jinja filters "money"/"moneyshort")
// in app.py.
export function fmtMoney(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "₦0.00";
  return `₦${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** An amount in a policy currency (G8): ₦ for naira, else the currency code. */
export function fmtCurrency(value: unknown, currency = "NGN"): string {
  if (!currency || currency === "NGN") return fmtMoney(value);
  const n = Number(value);
  return `${currency} ${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMoneyShort(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "₦0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1_000_000_000) {
    s = `${(abs / 1_000_000_000).toFixed(2)}B`;
  } else if (abs >= 1_000_000) {
    s = `${(abs / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    s = `${(abs / 1_000).toFixed(1)}K`;
  } else {
    s = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return `${sign}₦${s}`;
}

export function fmtPct(value: unknown, digits = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
