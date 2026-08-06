import { describe, expect, it } from "vitest";
import { computeRatios, groupByCategory, type RatioId, type RatioResult } from "../lib/ratios";
import type { StatementYear } from "../lib/yahoo";

function year(overrides: Partial<StatementYear> & { fiscalYear: number }): StatementYear {
  return {
    endDate: `${overrides.fiscalYear}-12-31`,
    revenue: null,
    grossProfit: null,
    operatingIncome: null,
    netIncome: null,
    currentAssets: null,
    currentLiabilities: null,
    totalAssets: null,
    totalLiabilities: null,
    totalEquity: null,
    inventory: null,
    cash: null,
    operatingCashFlow: null,
    capitalExpenditure: null,
    ...overrides,
  };
}

function find(results: RatioResult[], id: RatioId): RatioResult {
  const r = results.find((x) => x.id === id);
  if (!r) throw new Error(`ratio ${id} not found`);
  return r;
}

const HEALTHY_YEAR = year({
  fiscalYear: 2024,
  revenue: 1_000_000,
  grossProfit: 600_000,
  operatingIncome: 200_000,
  netIncome: 150_000,
  currentAssets: 500_000,
  currentLiabilities: 250_000,
  totalAssets: 1_200_000,
  totalLiabilities: 400_000,
  totalEquity: 800_000,
  inventory: 100_000,
  cash: 300_000,
  operatingCashFlow: 220_000,
  capitalExpenditure: 50_000,
});

describe("computeRatios — happy path arithmetic", () => {
  const results = computeRatios([HEALTHY_YEAR]);

  it("current ratio = current assets / current liabilities", () => {
    expect(find(results, "current_ratio").latestValue).toBe(2);
  });

  it("quick ratio = (current assets - inventory) / current liabilities", () => {
    expect(find(results, "quick_ratio").latestValue).toBe(1.6);
  });

  it("gross margin = gross profit / revenue, as a percent rounded to 1 decimal", () => {
    expect(find(results, "gross_margin").latestValue).toBe(60);
  });

  it("operating margin = operating income / revenue", () => {
    expect(find(results, "operating_margin").latestValue).toBe(20);
  });

  it("net margin = net income / revenue", () => {
    expect(find(results, "net_margin").latestValue).toBe(15);
  });

  it("return on equity = net income / total equity", () => {
    expect(find(results, "return_on_equity").latestValue).toBe(18.8);
  });

  it("debt to equity = total liabilities / total equity", () => {
    expect(find(results, "debt_to_equity").latestValue).toBe(0.5);
  });

  it("equity ratio = total equity / total assets", () => {
    expect(find(results, "equity_ratio").latestValue).toBeCloseTo(66.7, 1);
  });

  it("free cash flow = operating cash flow - capex", () => {
    expect(find(results, "free_cash_flow").latestValue).toBe(170_000);
  });

  it("fcf margin = free cash flow / revenue", () => {
    expect(find(results, "fcf_margin").latestValue).toBe(17);
  });

  it("operating cash ratio = operating cash flow / current liabilities", () => {
    expect(find(results, "operating_cash_ratio").latestValue).toBe(0.88);
  });

  it("every ratio reports status 'ok' when fully computable", () => {
    for (const r of results) {
      expect(r.latestStatus).toBe("ok");
    }
  });
});

describe("missing inputs never default to zero", () => {
  it("a ratio with a missing numerator input is unavailable, not zero", () => {
    const y = year({ fiscalYear: 2024, currentLiabilities: 250_000 }); // currentAssets missing
    const results = computeRatios([y]);
    const ratio = find(results, "current_ratio");
    expect(ratio.latestValue).toBeNull();
    expect(ratio.latestStatus).toBe("unavailable");
  });

  it("quick ratio is unavailable (not estimated) when inventory isn't reported", () => {
    const y = year({ fiscalYear: 2024, currentAssets: 500_000, currentLiabilities: 250_000 });
    const results = computeRatios([y]);
    const ratio = find(results, "quick_ratio");
    expect(ratio.latestValue).toBeNull();
    expect(ratio.latestStatus).toBe("unavailable");
  });

  it("bank-shaped data (no current assets/liabilities/inventory/capex) leaves those ratios unavailable without crashing", () => {
    const bankYear = year({
      fiscalYear: 2024,
      revenue: 180_000_000_000,
      netIncome: 57_000_000_000,
      totalAssets: 4_400_000_000_000,
      totalLiabilities: 4_000_000_000_000,
      totalEquity: 360_000_000_000,
      cash: 340_000_000_000,
      operatingCashFlow: -147_000_000_000,
    });
    const results = computeRatios([bankYear]);
    expect(find(results, "current_ratio").latestStatus).toBe("unavailable");
    expect(find(results, "quick_ratio").latestStatus).toBe("unavailable");
    expect(find(results, "gross_margin").latestStatus).toBe("unavailable");
    expect(find(results, "free_cash_flow").latestStatus).toBe("unavailable");
    expect(find(results, "equity_ratio").latestStatus).toBe("ok");
    expect(find(results, "net_margin").latestStatus).toBe("ok");
  });
});

describe("zero-denominator guard", () => {
  it("returns null instead of Infinity when current liabilities are zero", () => {
    const y = year({ fiscalYear: 2024, currentAssets: 500_000, currentLiabilities: 0 });
    const results = computeRatios([y]);
    expect(find(results, "current_ratio").latestValue).toBeNull();
  });

  it("returns null instead of NaN/Infinity when revenue is zero", () => {
    const y = year({ fiscalYear: 2024, grossProfit: 100_000, revenue: 0 });
    const results = computeRatios([y]);
    expect(find(results, "gross_margin").latestValue).toBeNull();
  });
});

describe("negative equity flags not_meaningful, per §5", () => {
  const negEquityYear = year({
    fiscalYear: 2024,
    netIncome: 50_000,
    totalLiabilities: 900_000,
    totalEquity: -100_000,
    totalAssets: 800_000,
  });
  const results = computeRatios([negEquityYear]);

  it("ROE is not_meaningful with negative equity, and no number is shown", () => {
    const roe = find(results, "return_on_equity");
    expect(roe.latestStatus).toBe("not_meaningful");
    expect(roe.latestValue).toBeNull();
  });

  it("debt to equity is not_meaningful with negative equity", () => {
    const de = find(results, "debt_to_equity");
    expect(de.latestStatus).toBe("not_meaningful");
    expect(de.latestValue).toBeNull();
  });

  it("equity ratio is still meaningful (it divides BY assets, not equity) and reports a negative value", () => {
    const er = find(results, "equity_ratio");
    expect(er.latestStatus).toBe("ok");
    expect(er.latestValue).toBe(-12.5);
  });
});

describe("trend classification", () => {
  it("is 'insufficient_data' with fewer than two available years", () => {
    const results = computeRatios([HEALTHY_YEAR]);
    expect(find(results, "current_ratio").trend).toBe("insufficient_data");
  });

  it("is 'improving' when the value rises more than 5%", () => {
    const y1 = year({ fiscalYear: 2022, currentAssets: 500_000, currentLiabilities: 500_000 }); // 1.0
    const y2 = year({ fiscalYear: 2023, currentAssets: 500_000, currentLiabilities: 400_000 }); // 1.25
    const results = computeRatios([y1, y2]);
    expect(find(results, "current_ratio").trend).toBe("improving");
  });

  it("is 'declining' when the value falls more than 5%", () => {
    const y1 = year({ fiscalYear: 2022, currentAssets: 500_000, currentLiabilities: 400_000 }); // 1.25
    const y2 = year({ fiscalYear: 2023, currentAssets: 500_000, currentLiabilities: 500_000 }); // 1.0
    const results = computeRatios([y1, y2]);
    expect(find(results, "current_ratio").trend).toBe("declining");
  });

  it("is 'stable' when the value moves less than 5%", () => {
    const y1 = year({ fiscalYear: 2022, currentAssets: 500_000, currentLiabilities: 250_000 }); // 2.0
    const y2 = year({ fiscalYear: 2023, currentAssets: 505_000, currentLiabilities: 250_000 }); // 2.02
    const results = computeRatios([y1, y2]);
    expect(find(results, "current_ratio").trend).toBe("stable");
  });

  it("skips years with unavailable data when judging trend", () => {
    const y1 = year({ fiscalYear: 2021, currentAssets: 500_000, currentLiabilities: 500_000 }); // 1.0
    const y2 = year({ fiscalYear: 2022 }); // missing -> unavailable, excluded
    const y3 = year({ fiscalYear: 2023, currentAssets: 500_000, currentLiabilities: 400_000 }); // 1.25
    const results = computeRatios([y1, y2, y3]);
    expect(find(results, "current_ratio").trend).toBe("improving");
  });
});

describe("groupByCategory", () => {
  it("buckets all 11 ratios into their four categories", () => {
    const results = computeRatios([HEALTHY_YEAR]);
    const grouped = groupByCategory(results);
    expect(grouped.liquidity).toHaveLength(2);
    expect(grouped.profitability).toHaveLength(4);
    expect(grouped.leverage).toHaveLength(2);
    expect(grouped.cash).toHaveLength(3);
  });
});
