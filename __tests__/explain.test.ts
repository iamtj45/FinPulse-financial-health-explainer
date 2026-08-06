import { describe, expect, it } from "vitest";
import { buildAllowedNumbers, extractNumbers, passesNumberGuard } from "../lib/explain";
import type { RatioResult } from "../lib/ratios";

function ratio(overrides: Partial<RatioResult> & Pick<RatioResult, "id">): RatioResult {
  return {
    label: "Current ratio",
    category: "liquidity",
    unit: "ratio",
    years: [],
    latestValue: null,
    latestStatus: "unavailable",
    trend: "insufficient_data",
    ...overrides,
  };
}

describe("extractNumbers", () => {
  it("finds integers, decimals, and percentages", () => {
    expect(extractNumbers("The ratio is 1.84, up from 1.5, or about 60% higher")).toEqual([
      1.84, 1.5, 60,
    ]);
  });

  it("finds a bare fiscal year", () => {
    expect(extractNumbers("As of 2024 the company improved.")).toEqual([2024]);
  });

  it("returns an empty array when there are no numbers", () => {
    expect(extractNumbers("No digits in this sentence at all.")).toEqual([]);
  });
});

describe("buildAllowedNumbers — the number guard's trust boundary", () => {
  const r = ratio({
    id: "current_ratio",
    years: [{ fiscalYear: 2024, value: 1.84, status: "ok", inputs: {} }],
  });

  it("includes the ratio's latest value and fiscal year", () => {
    const allowed = buildAllowedNumbers([r], "");
    expect(allowed.has(1.84)).toBe(true);
    expect(allowed.has(2024)).toBe(true);
  });

  it("includes numbers quoted in the retrieved notes", () => {
    const allowed = buildAllowedNumbers([r], "Healthy range is 1.5 to 3.0, per the notes.");
    expect(allowed.has(1.5)).toBe(true);
    expect(allowed.has(3.0)).toBe(true);
  });
});

describe("passesNumberGuard — drops explanations with invented numbers", () => {
  const r = ratio({
    id: "current_ratio",
    years: [{ fiscalYear: 2024, value: 1.84, status: "ok", inputs: {} }],
  });
  const allowed = buildAllowedNumbers([r], "The comfortable range is 1.5 to 3.0.");

  it("passes an explanation that only uses given numbers", () => {
    const text = "In 2024 the current ratio was 1.84, within the comfortable 1.5 to 3.0 range.";
    expect(passesNumberGuard(text, allowed)).toBe(true);
  });

  it("fails an explanation that invents a number nowhere in the context", () => {
    const text = "This is far below the industry average of 4.2, which is concerning.";
    expect(passesNumberGuard(text, allowed)).toBe(false);
  });

  it("tolerates trivial rounding differences within the guard's tolerance", () => {
    const text = "The ratio came in at roughly 1.85 this year.";
    expect(passesNumberGuard(text, allowed)).toBe(true);
  });

  it("fails when even one invented number appears alongside otherwise-valid ones", () => {
    const text = "At 1.84, up sharply from a fabricated 0.3 last year, this looks strong.";
    expect(passesNumberGuard(text, allowed)).toBe(false);
  });
});
