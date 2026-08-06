import { cache } from "react";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** One fiscal year's worth of line items. `null` means the field was not
 * reported for this company/year — never coerce to 0. */
export interface StatementYear {
  fiscalYear: number;
  endDate: string;

  // Income statement
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;

  // Balance sheet
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  inventory: number | null;
  cash: number | null;

  // Cash flow. capitalExpenditure is normalized to a positive magnitude
  // (the amount spent), even though Yahoo reports it as a negative cash
  // outflow — this matches the "operating cash flow − capex" formula in §5.
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
}

export interface CompanyFinancials {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  years: StatementYear[]; // oldest first, most recent last
  fetchedAt: string;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Yahoo reports capex as a negative cash outflow. Normalize to a positive
 * spend amount, or null if not reported. */
function capexMagnitude(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.abs(n);
}

/** Wrapped in React's request-scoped cache so the page and its metadata
 * generator share one upstream fetch instead of two. */
export const fetchCompanyFinancials = cache(async function fetchCompanyFinancials(
  ticker: string,
): Promise<CompanyFinancials> {
  const symbol = ticker.toUpperCase();

  const [timeSeries, summary] = await Promise.all([
    yf.fundamentalsTimeSeries(symbol, {
      period1: "2019-01-01",
      type: "annual",
      module: "all",
    }),
    yf.quoteSummary(symbol, {
      modules: ["assetProfile", "price", "quoteType"],
    }),
  ]);

  if (!timeSeries || timeSeries.length === 0) {
    throw new Error(`No financial statement data available for ${symbol}`);
  }

  // Keep the last 4 fiscal years, oldest first.
  const recentYears = timeSeries.slice(-4);

  const years: StatementYear[] = recentYears.map((row) => {
    const r = row as Record<string, unknown>;
    const endDate = row.date instanceof Date ? row.date : new Date(String(row.date));
    return {
      fiscalYear: endDate.getUTCFullYear(),
      endDate: endDate.toISOString().slice(0, 10),

      revenue: num(r.totalRevenue),
      grossProfit: num(r.grossProfit),
      operatingIncome: num(r.operatingIncome),
      netIncome: num(r.netIncome),

      currentAssets: num(r.currentAssets),
      currentLiabilities: num(r.currentLiabilities),
      totalAssets: num(r.totalAssets),
      totalLiabilities: num(r.totalLiabilitiesNetMinorityInterest),
      totalEquity: num(r.stockholdersEquity),
      inventory: num(r.inventory),
      cash: num(r.cashAndCashEquivalents),

      operatingCashFlow: num(r.operatingCashFlow),
      capitalExpenditure: capexMagnitude(r.capitalExpenditure),
    };
  });

  const companyName =
    summary.price?.longName ??
    summary.price?.shortName ??
    summary.quoteType?.longName ??
    symbol;

  return {
    ticker: symbol,
    companyName,
    sector: summary.assetProfile?.sector ?? null,
    industry: summary.assetProfile?.industry ?? null,
    marketCap: num(summary.price?.marketCap),
    years,
    fetchedAt: new Date().toISOString(),
  };
});
