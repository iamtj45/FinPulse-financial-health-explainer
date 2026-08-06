import { Suspense } from "react";
import type { Category, RatioResult } from "@/lib/ratios";
import type { Verdict } from "@/lib/health";
import { VerdictChip } from "./VerdictChip";
import { RatioList } from "./RatioList";
import { CategoryExplanations } from "./CategoryExplanations";
import styles from "./CategorySection.module.css";

const CATEGORY_LABEL: Record<Category, string> = {
  liquidity: "Liquidity",
  profitability: "Profitability",
  leverage: "Leverage",
  cash: "Cash",
};

export function CategorySection({
  category,
  ratios,
  verdict,
  companyName,
  sector,
}: {
  category: Category;
  ratios: RatioResult[];
  verdict: Verdict;
  companyName: string;
  sector: string | null;
}) {
  const pending = Object.fromEntries(
    ratios.filter((r) => r.latestStatus === "ok").map((r) => [r.id, "pending" as const]),
  );

  return (
    <section id={category} className={styles.section}>
      <div className={styles.heading}>
        <h2>{CATEGORY_LABEL[category]}</h2>
        <VerdictChip verdict={verdict} />
      </div>
      <Suspense fallback={<RatioList ratios={ratios} explanations={pending} />}>
        <CategoryExplanations
          category={category}
          ratios={ratios}
          companyName={companyName}
          sector={sector}
        />
      </Suspense>
    </section>
  );
}
