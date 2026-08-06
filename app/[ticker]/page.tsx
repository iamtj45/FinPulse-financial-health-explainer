import Link from "next/link";
import type { Metadata } from "next";
import { getCachedFinancials } from "@/lib/cachedData";
import { computeRatios, groupByCategory, type Category } from "@/lib/ratios";
import { categoryVerdicts } from "@/lib/health";
import { ReportHeader } from "@/app/components/ReportHeader";
import { HealthSummary } from "@/app/components/HealthSummary";
import { CategorySection } from "@/app/components/CategorySection";
import { InputsPanel } from "@/app/components/InputsPanel";
import { ReportFooter } from "@/app/components/ReportFooter";

const CATEGORY_ORDER: Category[] = ["liquidity", "profitability", "leverage", "cash"];

export async function generateMetadata({ params }: PageProps<"/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  try {
    const financials = await getCachedFinancials(ticker);
    return {
      title: `${financials.companyName} (${financials.ticker}) — FinPulse`,
      description: `Financial health ratios for ${financials.companyName}: liquidity, profitability, leverage, and cash — computed from real filings.`,
    };
  } catch {
    return { title: `${ticker.toUpperCase()} — FinPulse` };
  }
}

export default async function TickerPage({ params }: PageProps<"/[ticker]">) {
  const { ticker } = await params;

  let financials;
  try {
    financials = await getCachedFinancials(ticker);
  } catch (err) {
    return (
      <div className="page-shell">
        <p>
          <Link href="/">&larr; Back</Link>
        </p>
        <h1>Couldn&apos;t load {ticker.toUpperCase()}</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
          {err instanceof Error ? err.message : "No data available for this ticker."} This tool
          covers US-listed companies with annual filings on Yahoo Finance.
        </p>
        <p className="disclaimer" style={{ marginTop: "2rem" }}>
          Educational tool. Not investment advice.
        </p>
      </div>
    );
  }

  const ratios = computeRatios(financials.years);
  const grouped = groupByCategory(ratios);
  const verdicts = categoryVerdicts(grouped);

  return (
    <div className="page-shell">
      <p>
        <Link href="/">&larr; Analyze another ticker</Link>
      </p>
      <ReportHeader financials={financials} />
      <HealthSummary verdicts={verdicts} />

      {CATEGORY_ORDER.map((cat) => (
        <CategorySection
          key={cat}
          category={cat}
          ratios={grouped[cat]}
          verdict={verdicts[cat]}
          companyName={financials.companyName}
          sector={financials.sector}
        />
      ))}

      <InputsPanel years={financials.years} />
      <ReportFooter fetchedAt={financials.fetchedAt} />
    </div>
  );
}
