import type { Category, RatioResult } from "@/lib/ratios";
import { getCachedExplanations } from "@/lib/cachedData";
import { RatioList } from "./RatioList";

/** Async Server Component: the Suspense boundary around this is what makes
 * explanations stream in after the ratios render (§11) — the fallback
 * shows the same rows with a "Generating…" placeholder, so there's no
 * layout shift when this resolves. */
export async function CategoryExplanations({
  category,
  ratios,
  companyName,
  sector,
}: {
  category: Category;
  ratios: RatioResult[];
  companyName: string;
  sector: string | null;
}) {
  const explanations = await getCachedExplanations({ category, ratios, companyName, sector });
  return <RatioList ratios={ratios} explanations={explanations} />;
}
