import type { StatementYear } from "./yahoo";

export type Category = "liquidity" | "profitability" | "leverage" | "cash";
export type Unit = "ratio" | "percent" | "currency";
export type Trend = "improving" | "declining" | "stable" | "insufficient_data";
export type YearStatus = "ok" | "unavailable" | "not_meaningful";

export type RatioId =
  | "current_ratio"
  | "quick_ratio"
  | "gross_margin"
  | "operating_margin"
  | "net_margin"
  | "return_on_equity"
  | "debt_to_equity"
  | "equity_ratio"
  | "free_cash_flow"
  | "fcf_margin"
  | "operating_cash_ratio";

export interface RatioYearValue {
  fiscalYear: number;
  value: number | null;
  status: YearStatus;
  inputs: Record<string, number | null>;
}

export interface RatioResult {
  id: RatioId;
  label: string;
  category: Category;
  unit: Unit;
  years: RatioYearValue[]; // chronological, oldest first
  latestValue: number | null;
  latestStatus: YearStatus;
  trend: Trend;
}

/** Division guarded against a missing or zero denominator, per §5. */
function divide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function round(value: number | null, decimals: number): number | null {
  if (value === null) return null;
  return Number(value.toFixed(decimals));
}

// Ratios (x.xx) round to 2 decimals; percentages round to 1. Free cash flow
// is a raw currency amount and isn't rounded to a decimal place at all.
const roundRatio = (v: number | null) => round(v, 2);
const roundPercent = (v: number | null) => round(v === null ? null : v * 100, 1);
const roundCurrency = (v: number | null) => (v === null ? null : Math.round(v));

interface RatioDef {
  id: RatioId;
  label: string;
  category: Category;
  unit: Unit;
  /** Whether a bigger number is a healthier number. Defaults to true.
   * Only debt-to-equity sets this false: it is the one ratio here where a
   * rise is a deterioration, and correspondingly the only one whose health
   * bands in lib/health.ts run strong -> weak instead of weak -> strong. */
  higherIsBetter?: boolean;
  /** Computes one year's value. Returns status: 'not_meaningful' when the
   * math is technically possible but financially misleading (§5) — e.g.
   * dividing by negative equity. */
  compute: (year: StatementYear) => { value: number | null; status: YearStatus; inputs: Record<string, number | null> };
}

const RATIO_DEFS: RatioDef[] = [
  {
    id: "current_ratio",
    label: "Current ratio",
    category: "liquidity",
    unit: "ratio",
    compute: (y) => {
      const value = roundRatio(divide(y.currentAssets, y.currentLiabilities));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { currentAssets: y.currentAssets, currentLiabilities: y.currentLiabilities },
      };
    },
  },
  {
    id: "quick_ratio",
    label: "Quick ratio",
    category: "liquidity",
    unit: "ratio",
    compute: (y) => {
      const numerator =
        y.currentAssets === null || y.inventory === null ? null : y.currentAssets - y.inventory;
      const value = roundRatio(divide(numerator, y.currentLiabilities));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: {
          currentAssets: y.currentAssets,
          inventory: y.inventory,
          currentLiabilities: y.currentLiabilities,
        },
      };
    },
  },
  {
    id: "gross_margin",
    label: "Gross margin",
    category: "profitability",
    unit: "percent",
    compute: (y) => {
      const value = roundPercent(divide(y.grossProfit, y.revenue));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { grossProfit: y.grossProfit, revenue: y.revenue },
      };
    },
  },
  {
    id: "operating_margin",
    label: "Operating margin",
    category: "profitability",
    unit: "percent",
    compute: (y) => {
      const value = roundPercent(divide(y.operatingIncome, y.revenue));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { operatingIncome: y.operatingIncome, revenue: y.revenue },
      };
    },
  },
  {
    id: "net_margin",
    label: "Net margin",
    category: "profitability",
    unit: "percent",
    compute: (y) => {
      const value = roundPercent(divide(y.netIncome, y.revenue));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { netIncome: y.netIncome, revenue: y.revenue },
      };
    },
  },
  {
    id: "return_on_equity",
    label: "Return on equity",
    category: "profitability",
    unit: "percent",
    compute: (y) => {
      const inputs = { netIncome: y.netIncome, totalEquity: y.totalEquity };
      if (y.totalEquity !== null && y.totalEquity <= 0) {
        return { value: null, status: "not_meaningful", inputs };
      }
      const value = roundPercent(divide(y.netIncome, y.totalEquity));
      return { value, status: value === null ? "unavailable" : "ok", inputs };
    },
  },
  {
    id: "debt_to_equity",
    label: "Debt to equity",
    category: "leverage",
    unit: "ratio",
    // More liabilities per unit of equity is more fixed obligation
    // regardless of earnings, so a rise here is a deterioration.
    higherIsBetter: false,
    compute: (y) => {
      const inputs = { totalLiabilities: y.totalLiabilities, totalEquity: y.totalEquity };
      if (y.totalEquity !== null && y.totalEquity <= 0) {
        return { value: null, status: "not_meaningful", inputs };
      }
      const value = roundRatio(divide(y.totalLiabilities, y.totalEquity));
      return { value, status: value === null ? "unavailable" : "ok", inputs };
    },
  },
  {
    id: "equity_ratio",
    label: "Equity ratio",
    category: "leverage",
    unit: "percent",
    compute: (y) => {
      const value = roundPercent(divide(y.totalEquity, y.totalAssets));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { totalEquity: y.totalEquity, totalAssets: y.totalAssets },
      };
    },
  },
  {
    id: "free_cash_flow",
    label: "Free cash flow",
    category: "cash",
    unit: "currency",
    compute: (y) => {
      const value =
        y.operatingCashFlow === null || y.capitalExpenditure === null
          ? null
          : roundCurrency(y.operatingCashFlow - y.capitalExpenditure);
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { operatingCashFlow: y.operatingCashFlow, capitalExpenditure: y.capitalExpenditure },
      };
    },
  },
  {
    id: "fcf_margin",
    label: "FCF margin",
    category: "cash",
    unit: "percent",
    compute: (y) => {
      const fcf =
        y.operatingCashFlow === null || y.capitalExpenditure === null
          ? null
          : y.operatingCashFlow - y.capitalExpenditure;
      const value = roundPercent(divide(fcf, y.revenue));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: {
          operatingCashFlow: y.operatingCashFlow,
          capitalExpenditure: y.capitalExpenditure,
          revenue: y.revenue,
        },
      };
    },
  },
  {
    id: "operating_cash_ratio",
    label: "Operating cash ratio",
    category: "cash",
    unit: "ratio",
    compute: (y) => {
      const value = roundRatio(divide(y.operatingCashFlow, y.currentLiabilities));
      return {
        value,
        status: value === null ? "unavailable" : "ok",
        inputs: { operatingCashFlow: y.operatingCashFlow, currentLiabilities: y.currentLiabilities },
      };
    },
  },
];

/** "improving" means the company's position got healthier, which is not the
 * same thing as the number getting bigger. This used to equate the two, so
 * a company whose debt-to-equity climbed from 0.4 to 1.8 — a large increase
 * in leverage — was labelled "improving" on screen, and the same word went
 * into the prompt, so the generated prose repeated it. Each ratio now
 * declares which direction is the healthy one and movement is read against
 * that.
 *
 * improving/declining still requires >5% movement between the earliest and
 * latest available (status 'ok') year; smaller movement reads as noise. */
function computeTrend(years: RatioYearValue[], higherIsBetter: boolean): Trend {
  const ok = years.filter((y) => y.status === "ok" && y.value !== null);
  if (ok.length < 2) return "insufficient_data";
  const first = ok[0].value as number;
  const last = ok[ok.length - 1].value as number;

  let direction: "up" | "down" | "flat";
  if (first === 0) {
    direction = last === 0 ? "flat" : last > 0 ? "up" : "down";
  } else {
    const pctChange = ((last - first) / Math.abs(first)) * 100;
    direction = pctChange > 5 ? "up" : pctChange < -5 ? "down" : "flat";
  }

  if (direction === "flat") return "stable";
  const movedTheHealthyWay = direction === "up" ? higherIsBetter : !higherIsBetter;
  return movedTheHealthyWay ? "improving" : "declining";
}

/** Computes every ratio in §5 across all available fiscal years.
 * `years` must be chronological, oldest first. */
export function computeRatios(years: StatementYear[]): RatioResult[] {
  return RATIO_DEFS.map((def) => {
    const yearValues: RatioYearValue[] = years.map((y) => {
      const { value, status, inputs } = def.compute(y);
      return { fiscalYear: y.fiscalYear, value, status, inputs };
    });

    const latest = yearValues[yearValues.length - 1];

    return {
      id: def.id,
      label: def.label,
      category: def.category,
      unit: def.unit,
      years: yearValues,
      latestValue: latest?.value ?? null,
      latestStatus: latest?.status ?? "unavailable",
      trend: computeTrend(yearValues, def.higherIsBetter ?? true),
    };
  });
}

export function groupByCategory(results: RatioResult[]): Record<Category, RatioResult[]> {
  const groups: Record<Category, RatioResult[]> = {
    liquidity: [],
    profitability: [],
    leverage: [],
    cash: [],
  };
  for (const r of results) groups[r.category].push(r);
  return groups;
}

export const RATIO_IDS: RatioId[] = RATIO_DEFS.map((d) => d.id);

/** Static label/category/unit lookup by ratio id — used where a ratio is
 * named without a full computed StatementYear behind it, e.g. the MCP
 * server's single-ratio explain tool. */
export const RATIO_META: Record<RatioId, { label: string; category: Category; unit: Unit }> =
  Object.fromEntries(
    RATIO_DEFS.map((d) => [d.id, { label: d.label, category: d.category, unit: d.unit }]),
  ) as Record<RatioId, { label: string; category: Category; unit: Unit }>;
