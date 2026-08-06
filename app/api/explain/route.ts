import { NextRequest, NextResponse } from "next/server";
import { getCachedExplanations, getCachedFinancials } from "@/lib/cachedData";
import { computeRatios, groupByCategory, type Category } from "@/lib/ratios";
import type { Explanations } from "@/lib/explain";

const CATEGORY_ORDER: Category[] = ["liquidity", "profitability", "leverage", "cash"];

/** Retrieve + generate, one call per ratio group, run in parallel — never
 * blocks on a slow/failed LLM call for the whole response (§12). */
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Missing required query param: ticker" }, { status: 400 });
  }

  let financials;
  try {
    financials = await getCachedFinancials(ticker);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch financial data" },
      { status: 502 },
    );
  }

  const grouped = groupByCategory(computeRatios(financials.years));

  const entries = await Promise.all(
    CATEGORY_ORDER.map(async (category) => {
      const explanations = await getCachedExplanations({
        companyName: financials.companyName,
        sector: financials.sector,
        category,
        ratios: grouped[category],
      });
      return [category, explanations] as const;
    }),
  );

  const explanations = Object.fromEntries(entries) as Record<Category, Explanations>;
  return NextResponse.json({ explanations });
}
