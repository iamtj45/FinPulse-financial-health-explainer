import { describe, expect, it } from "vitest";
import { categoryVerdict, ratioVerdict } from "../lib/health";
import type { RatioResult } from "../lib/ratios";

function ratio(overrides: Partial<RatioResult> & Pick<RatioResult, "id">): RatioResult {
  return {
    label: "",
    category: "liquidity",
    unit: "ratio",
    years: [],
    latestValue: null,
    latestStatus: "unavailable",
    trend: "insufficient_data",
    ...overrides,
  };
}

describe("ratioVerdict", () => {
  it("is unavailable when the ratio has no value", () => {
    const r = ratio({ id: "current_ratio", latestStatus: "unavailable", latestValue: null });
    expect(ratioVerdict(r)).toBe("unavailable");
  });

  it("is unavailable (not a number-backed verdict) when not_meaningful", () => {
    const r = ratio({ id: "return_on_equity", latestStatus: "not_meaningful", latestValue: null });
    expect(ratioVerdict(r)).toBe("unavailable");
  });

  it("current ratio of 2.0 is strong (within the 1.5-3.0 comfortable band)", () => {
    const r = ratio({ id: "current_ratio", latestStatus: "ok", latestValue: 2.0 });
    expect(ratioVerdict(r)).toBe("strong");
  });

  it("current ratio of 5.0 is adequate, not strong — high isn't automatically good", () => {
    const r = ratio({ id: "current_ratio", latestStatus: "ok", latestValue: 5.0 });
    expect(ratioVerdict(r)).toBe("adequate");
  });

  it("debt to equity is inverted: lower value is strong, higher is weak", () => {
    const low = ratio({ id: "debt_to_equity", latestStatus: "ok", latestValue: 0.2 });
    const high = ratio({ id: "debt_to_equity", latestStatus: "ok", latestValue: 3.0 });
    expect(ratioVerdict(low)).toBe("strong");
    expect(ratioVerdict(high)).toBe("weak");
  });
});

describe("categoryVerdict", () => {
  it("is unavailable when every ratio in the category is unavailable", () => {
    const results = [
      ratio({ id: "current_ratio", latestStatus: "unavailable" }),
      ratio({ id: "quick_ratio", latestStatus: "unavailable" }),
    ];
    expect(categoryVerdict(results)).toBe("unavailable");
  });

  it("averages available ratios and ignores unavailable ones", () => {
    const results = [
      ratio({ id: "current_ratio", latestStatus: "ok", latestValue: 2.0 }), // strong
      ratio({ id: "quick_ratio", latestStatus: "unavailable" }), // ignored
    ];
    expect(categoryVerdict(results)).toBe("strong");
  });
});
