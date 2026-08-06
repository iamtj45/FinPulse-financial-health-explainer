import type { Category, RatioId, RatioResult } from "./ratios";

export type Verdict = "strong" | "adequate" | "weak" | "unavailable";

/**
 * Health verdict thresholds.
 *
 * These bands are judgment calls, not universal financial law — the same
 * numbers get different readings in different sectors (see content/kb/ for
 * the sector exceptions the explanation layer surfaces). They exist to give
 * a fast, deterministic first read; the generated explanation is where
 * sector context softens or overrides them. Documented here, per §14/§15,
 * as this project's own stated judgment rather than an authoritative
 * standard.
 *
 * Bands are ascending on `upTo`; a value matches the first band whose
 * `upTo` it is less than or equal to.
 */
interface Band {
  upTo: number;
  verdict: Verdict;
}

const THRESHOLDS: Record<RatioId, Band[]> = {
  // Below 1.0: liabilities exceed assets due in the same window — strain,
  // though normal for cash-up-front businesses. 1.5-3.0: comfortable.
  // Above 3.0: not necessarily good — often idle capital (see KB).
  current_ratio: [
    { upTo: 1.0, verdict: "weak" },
    { upTo: 1.5, verdict: "adequate" },
    { upTo: 3.0, verdict: "strong" },
    { upTo: Infinity, verdict: "adequate" },
  ],

  // Same shape as current ratio but stricter, since inventory (often the
  // least liquid current asset) is excluded from the numerator.
  quick_ratio: [
    { upTo: 0.5, verdict: "weak" },
    { upTo: 1.0, verdict: "adequate" },
    { upTo: 2.0, verdict: "strong" },
    { upTo: Infinity, verdict: "adequate" },
  ],

  // Gross margin varies enormously by sector (retail vs. software) — these
  // are general-business bands; the KB carries the sector-specific reads.
  gross_margin: [
    { upTo: 20, verdict: "weak" },
    { upTo: 40, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],

  operating_margin: [
    { upTo: 5, verdict: "weak" },
    { upTo: 15, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],

  // Below 0: the company is losing money on each dollar of revenue.
  net_margin: [
    { upTo: 0, verdict: "weak" },
    { upTo: 10, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],

  return_on_equity: [
    { upTo: 5, verdict: "weak" },
    { upTo: 15, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],

  // Lower is safer here — more of the balance sheet financed by liabilities
  // rather than equity increases fixed obligations regardless of earnings.
  debt_to_equity: [
    { upTo: 0.5, verdict: "strong" },
    { upTo: 1.5, verdict: "adequate" },
    { upTo: Infinity, verdict: "weak" },
  ],

  equity_ratio: [
    { upTo: 25, verdict: "weak" },
    { upTo: 50, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],

  // Free cash flow spans orders of magnitude across company sizes, so no
  // dollar threshold generalizes — only the sign is a fair universal signal.
  free_cash_flow: [
    { upTo: 0, verdict: "weak" },
    { upTo: Infinity, verdict: "strong" },
  ],

  fcf_margin: [
    { upTo: 0, verdict: "weak" },
    { upTo: 10, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],

  operating_cash_ratio: [
    { upTo: 0.5, verdict: "weak" },
    { upTo: 1.0, verdict: "adequate" },
    { upTo: Infinity, verdict: "strong" },
  ],
};

/** Verdict for a single ratio's latest value. `not_meaningful` and
 * `unavailable` statuses both surface as 'unavailable' — neither displays
 * a number, so neither can support a health claim. */
export function ratioVerdict(result: RatioResult): Verdict {
  if (result.latestStatus !== "ok" || result.latestValue === null) {
    return "unavailable";
  }
  const bands = THRESHOLDS[result.id];
  for (const band of bands) {
    if (result.latestValue <= band.upTo) return band.verdict;
  }
  return "unavailable";
}

const VERDICT_SCORE: Record<Exclude<Verdict, "unavailable">, number> = {
  weak: 0,
  adequate: 1,
  strong: 2,
};

/** Category verdict is the average of its available ratios' scores,
 * rounded to the nearest band. A category with no available ratios is
 * itself unavailable rather than defaulting to a middle verdict. */
export function categoryVerdict(results: RatioResult[]): Verdict {
  const scored = results
    .map((r) => ratioVerdict(r))
    .filter((v): v is Exclude<Verdict, "unavailable"> => v !== "unavailable");

  if (scored.length === 0) return "unavailable";

  const avg = scored.reduce((sum, v) => sum + VERDICT_SCORE[v], 0) / scored.length;
  if (avg >= 1.5) return "strong";
  if (avg >= 0.5) return "adequate";
  return "weak";
}

export function categoryVerdicts(
  grouped: Record<Category, RatioResult[]>,
): Record<Category, Verdict> {
  return {
    liquidity: categoryVerdict(grouped.liquidity),
    profitability: categoryVerdict(grouped.profitability),
    leverage: categoryVerdict(grouped.leverage),
    cash: categoryVerdict(grouped.cash),
  };
}
