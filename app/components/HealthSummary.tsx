import type { Category } from "@/lib/ratios";
import type { Verdict } from "@/lib/health";
import { VerdictChip } from "./VerdictChip";
import styles from "./HealthSummary.module.css";

const CATEGORY_LABEL: Record<Category, string> = {
  liquidity: "Liquidity",
  profitability: "Profitability",
  leverage: "Leverage",
  cash: "Cash",
};

const CATEGORY_ORDER: Category[] = ["liquidity", "profitability", "leverage", "cash"];

export function HealthSummary({ verdicts }: { verdicts: Record<Category, Verdict> }) {
  return (
    <section className={styles.grid} aria-label="Health summary">
      {CATEGORY_ORDER.map((cat) => (
        <a key={cat} href={`#${cat}`} className={styles.card}>
          <span className={styles.label}>{CATEGORY_LABEL[cat]}</span>
          <VerdictChip verdict={verdicts[cat]} />
        </a>
      ))}
    </section>
  );
}
