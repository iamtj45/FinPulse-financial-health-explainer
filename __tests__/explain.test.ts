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

/** Every case above uses unit "ratio", where the stored value and the
 * displayed value are the same text. They differ for currency, and that
 * gap silently deleted every free-cash-flow explanation. */
describe("the number guard and currency values", () => {
  const fcf = ratio({
    id: "free_cash_flow",
    label: "Free cash flow",
    category: "cash",
    unit: "currency",
    latestValue: 108_807_000_000,
    latestStatus: "ok",
    years: [{ fiscalYear: 2025, value: 108_807_000_000, status: "ok", inputs: {} }],
  });

  it("allows the compact figure the prompt actually shows the model", () => {
    // The prompt renders this as "$108.8B", so 108.8 is what comes back.
    expect(buildAllowedNumbers([fcf], "").has(108.8)).toBe(true);
  });

  it("keeps an explanation that quotes free cash flow as it was shown", () => {
    const text = "Free cash flow reached $108.8B in 2025, comfortably positive.";
    expect(passesNumberGuard(text, buildAllowedNumbers([fcf], ""))).toBe(true);
  });

  it("still rejects a dollar figure that was never given", () => {
    const text = "Free cash flow reached $250.4B in 2025, comfortably positive.";
    expect(passesNumberGuard(text, buildAllowedNumbers([fcf], ""))).toBe(false);
  });
});

/** Observed against a live model: it stated the ratio correctly and then
 * restated it as a percentage in the next clause, and the guard deleted the
 * whole explanation over the restatement. */
/** Observed repeatedly against a live model, and the biggest single cause
 * of ratios rendering with no commentary: it rounds for readability. */
describe("the number guard and rounding", () => {
  const margin = ratio({
    id: "operating_margin",
    unit: "percent",
    latestValue: 12.7,
    latestStatus: "ok",
    years: [{ fiscalYear: 2026, value: 12.7, status: "ok", inputs: {} }],
  });
  const allowed = buildAllowedNumbers([margin], "");

  it("keeps 12.7% restated as roughly 13%", () => {
    expect(passesNumberGuard("An operating margin of roughly 13% is typical.", allowed)).toBe(true);
  });

  it("keeps 8.6% restated as about 9 cents on the dollar", () => {
    const net = ratio({
      id: "net_margin",
      unit: "percent",
      latestValue: 8.6,
      latestStatus: "ok",
      years: [{ fiscalYear: 2026, value: 8.6, status: "ok", inputs: {} }],
    });
    const text = "It converts about 9 cents of every sales dollar into profit.";
    expect(passesNumberGuard(text, buildAllowedNumbers([net], ""))).toBe(true);
  });

  it("does not let rounding turn a wrong number into a right one", () => {
    expect(passesNumberGuard("An operating margin of 48% is strong.", allowed)).toBe(false);
  });

  it("does not let rounding blur one fiscal year into another", () => {
    const r = ratio({
      id: "current_ratio",
      latestValue: 1.84,
      latestStatus: "ok",
      years: [{ fiscalYear: 2025, value: 1.84, status: "ok", inputs: {} }],
    });
    expect(passesNumberGuard("Back in 2015 things differed.", buildAllowedNumbers([r], ""))).toBe(
      false,
    );
  });
});

describe("the number guard and unit restatements", () => {
  const ocr = ratio({
    id: "operating_cash_ratio",
    label: "Operating cash ratio",
    category: "cash",
    unit: "ratio",
    latestValue: 0.85,
    latestStatus: "ok",
    years: [{ fiscalYear: 2025, value: 0.85, status: "ok", inputs: {} }],
  });

  it("keeps a ratio restated as the equivalent percentage", () => {
    const text = "An operating cash ratio of 0.85 means it covers 85% of current liabilities.";
    expect(passesNumberGuard(text, buildAllowedNumbers([ocr], ""))).toBe(true);
  });

  it("keeps a percentage restated as the equivalent decimal", () => {
    const margin = ratio({
      id: "net_margin",
      unit: "percent",
      latestValue: 40.3,
      latestStatus: "ok",
      years: [{ fiscalYear: 2025, value: 40.3, status: "ok", inputs: {} }],
    });
    const text = "A net margin of 40.3% is 0.403 of every revenue dollar.";
    expect(passesNumberGuard(text, buildAllowedNumbers([margin], ""))).toBe(true);
  });

  it("keeps the rhetorical '1' in 'for every $1 of equity'", () => {
    const de = ratio({
      id: "debt_to_equity",
      unit: "ratio",
      latestValue: 7.2,
      latestStatus: "ok",
      years: [{ fiscalYear: 2026, value: 7.2, status: "ok", inputs: {} }],
    });
    const text = "It carries $7.20 of debt for every $1 of equity.";
    expect(passesNumberGuard(text, buildAllowedNumbers([de], ""))).toBe(true);
  });

  it("still rejects a percentage that is not the given ratio in disguise", () => {
    const text = "An operating cash ratio of 0.85 means it covers 92% of current liabilities.";
    expect(passesNumberGuard(text, buildAllowedNumbers([ocr], ""))).toBe(false);
  });
});

describe("the number guard and fiscal years", () => {
  const r = ratio({
    id: "current_ratio",
    latestValue: 1.84,
    latestStatus: "ok",
    years: [
      { fiscalYear: 2022, value: 1.2, status: "ok", inputs: {} },
      { fiscalYear: 2023, value: 1.5, status: "ok", inputs: {} },
      { fiscalYear: 2024, value: 1.84, status: "ok", inputs: {} },
    ],
  });
  const allowed = buildAllowedNumbers([r], "");

  it("allows every fiscal year the report covers, not just the latest", () => {
    expect(allowed.has(2022)).toBe(true);
    expect(allowed.has(2024)).toBe(true);
  });

  it("keeps an explanation that spans the window it was given", () => {
    const text = "The ratio has climbed steadily from 2022 to 2024, reaching 1.84.";
    expect(passesNumberGuard(text, allowed)).toBe(true);
  });

  it("does not turn earlier years' values into quotable figures", () => {
    // 2022 and 2023 are quotable as dates; 1.2 and 1.5 are not, because the
    // prompt never showed them.
    expect(allowed.has(1.2)).toBe(false);
    expect(passesNumberGuard("It rose from 1.2 in 2022.", allowed)).toBe(false);
  });

  it("still rejects a year outside the report", () => {
    expect(passesNumberGuard("Back in 2015 the picture was different.", allowed)).toBe(false);
  });
});
