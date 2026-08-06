import { NextRequest, NextResponse } from "next/server";
import { getCachedFinancials } from "@/lib/cachedData";
import { computeRatios, groupByCategory } from "@/lib/ratios";
import { categoryVerdicts } from "@/lib/health";

/** Fetch + compute, exposed as JSON — the same logic the report page and
 * the MCP `get_ratios` tool use. No LLM call on this path. */
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Missing required query param: ticker" }, { status: 400 });
  }

  try {
    const financials = await getCachedFinancials(ticker);
    const ratios = computeRatios(financials.years);
    const verdicts = categoryVerdicts(groupByCategory(ratios));
    return NextResponse.json({ financials, ratios, verdicts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch financial data" },
      { status: 502 },
    );
  }
}
