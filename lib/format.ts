import type { RatioResult } from "./ratios";

const INPUT_LABELS: Record<string, string> = {
  currentAssets: "current assets",
  currentLiabilities: "current liabilities",
  inventory: "inventory",
  grossProfit: "gross profit",
  revenue: "revenue",
  operatingIncome: "operating income",
  netIncome: "net income",
  totalEquity: "total equity",
  totalLiabilities: "total liabilities",
  totalAssets: "total assets",
  operatingCashFlow: "operating cash flow",
  capitalExpenditure: "capital expenditure",
};

/** Human-readable reason a ratio has no number, for the "not reported"
 * state — always says why rather than showing a blank or a zero (§11). */
export function unavailableReason(result: Pick<RatioResult, "latestStatus" | "years">): string {
  const latest = result.years[result.years.length - 1];
  if (!latest) return "no data available";
  if (result.latestStatus === "not_meaningful") {
    return "negative equity";
  }
  const entries = Object.entries(latest.inputs);
  const label = (k: string) => INPUT_LABELS[k] ?? k;

  const missing = entries.filter(([, v]) => v === null).map(([k]) => label(k));
  if (missing.length > 0) return `${missing.join(", ")} not reported`;

  // Every input was reported, so the only way the value is still null is a
  // zero denominator. Saying "not reported" here would be false.
  const zeros = entries.filter(([, v]) => v === 0).map(([k]) => label(k));
  if (zeros.length > 0) return `${zeros.join(", ")} reported as zero`;

  return "not reported";
}

export function formatRatioValue(result: Pick<RatioResult, "unit" | "latestValue">): string {
  if (result.latestValue === null) return "—";
  switch (result.unit) {
    case "percent":
      return `${result.latestValue.toFixed(1)}%`;
    case "currency":
      return formatCurrencyCompact(result.latestValue);
    case "ratio":
    default:
      return result.latestValue.toFixed(2);
  }
}

export function formatCurrencyCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatInputValue(value: number | null): string {
  if (value === null) return "not reported";
  return formatCurrencyCompact(value);
}

export function formatMarketCap(value: number | null): string {
  if (value === null) return "not reported";
  return formatCurrencyCompact(value);
}
