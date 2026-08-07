import { describe, expect, it } from "vitest";
import { unavailableReason } from "../lib/format";
import type { RatioResult } from "../lib/ratios";

type ReasonInput = Pick<RatioResult, "latestStatus" | "years">;

function result(
  latestStatus: RatioResult["latestStatus"],
  inputs: Record<string, number | null>,
): ReasonInput {
  return {
    latestStatus,
    years: [{ fiscalYear: 2024, value: null, status: latestStatus, inputs }],
  };
}

describe("unavailableReason", () => {
  it("names the single line item the company did not report", () => {
    const r = result("unavailable", { currentAssets: 1000, currentLiabilities: null });
    expect(unavailableReason(r)).toBe("current liabilities not reported");
  });

  it("names every missing line item, not just the first", () => {
    const r = result("unavailable", { currentAssets: null, inventory: null, currentLiabilities: 500 });
    expect(unavailableReason(r)).toBe("current assets, inventory not reported");
  });

  it("says 'reported as zero' when the inputs were filed but the denominator is zero", () => {
    const r = result("unavailable", { grossProfit: 0, revenue: 0 });
    expect(unavailableReason(r)).toBe("gross profit, revenue reported as zero");
  });

  it("does not claim a zero denominator was unreported", () => {
    const r = result("unavailable", { operatingCashFlow: 4000, currentLiabilities: 0 });
    expect(unavailableReason(r)).not.toContain("not reported");
    expect(unavailableReason(r)).toBe("current liabilities reported as zero");
  });

  it("reports negative equity rather than a reporting gap for not_meaningful", () => {
    const r = result("not_meaningful", { netIncome: 500, totalEquity: -200 });
    expect(unavailableReason(r)).toBe("negative equity");
  });

  it("falls back cleanly when there are no years at all", () => {
    expect(unavailableReason({ latestStatus: "unavailable", years: [] })).toBe("no data available");
  });
});
