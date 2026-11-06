/**
 * Next.js-specific caching wrappers (§9). Kept out of lib/yahoo.ts and
 * lib/explain.ts on purpose: those stay framework-agnostic, so the fetch /
 * compute / explain logic can be called from a plain Node process without
 * dragging in Next's request/render context, which `unstable_cache`
 * requires. Only the app layer (pages, route handlers) imports this file.
 */
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { fetchCompanyFinancials, type CompanyFinancials } from "./yahoo";
import { explainCategory, type ExplainCategoryInput, type Explanations } from "./explain";
import type { RatioResult } from "./ratios";

const DAY_IN_SECONDS = 60 * 60 * 24;

/** Financial statements change quarterly at most — a 24h TTL keyed by
 * ticker avoids re-hitting the (unofficial, rate-limited) upstream source
 * on every page load. */
export async function getCachedFinancials(ticker: string): Promise<CompanyFinancials> {
  const cached = unstable_cache(
    async (t: string) => fetchCompanyFinancials(t),
    ["company-financials"],
    { revalidate: DAY_IN_SECONDS, tags: ["financials"] },
  );
  return cached(ticker.toUpperCase());
}

/** Keys the cache by a hash of the computed ratio values that will actually
 * reach the prompt, not by ticker+date — identical numbers produce an
 * identical prompt, so this also naturally caches across re-fetches of the
 * same fiscal year, and busts itself the moment a value changes. */
function explanationCacheKey(input: ExplainCategoryInput, ratios: RatioResult[]): string {
  const payload = JSON.stringify({
    company: input.companyName,
    sector: input.sector,
    category: input.category,
    ratios: ratios
      .map((r) => ({ id: r.id, value: r.latestValue, status: r.latestStatus, trend: r.trend }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function getCachedExplanations(input: ExplainCategoryInput): Promise<Explanations> {
  const explainable = input.ratios.filter((r) => r.latestStatus === "ok");
  if (explainable.length === 0) return {};

  const key = explanationCacheKey(input, explainable);
  const cached = unstable_cache(async () => explainCategory(input), ["explain-category", key], {
    // No TTL: the cache key is already content-addressed by the ratio
    // values, so a changed number produces a new key rather than a stale
    // hit — nothing to expire on a timer.
    revalidate: false,
  });

  try {
    return await cached();
  } catch (err) {
    // explainCategory only throws when generation itself couldn't run
    // (§lib/explain.ts) — deliberately not cached, so the next request
    // (e.g. once API keys are configured) tries again instead of replaying
    // this failure forever.
    // Say plainly what the reader is about to see, because the page gives
    // no hint: it renders the ratios with no commentary underneath, which
    // looks identical to "no key configured". That ambiguity is how a
    // retired model went unnoticed for three months.
    console.error(
      `FinPulse: NO EXPLANATIONS for category "${input.category}" — ratios will render bare. ` +
        `Usually a bad or missing LLM_* setting, or a model the provider has retired. Cause:`,
      err,
    );
    return {};
  }
}
