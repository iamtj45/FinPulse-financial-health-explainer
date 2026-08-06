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
    return "not meaningful — negative equity";
  }
  const missing = Object.entries(latest.inputs)
    .filter(([, v]) => v === null)
    .map(([k]) => INPUT_LABELS[k] ?? k);
  if (missing.length === 0) return "not reported";
  return `${missing.join(", ")} not reported`;
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
