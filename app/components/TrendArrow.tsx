import type { Trend } from "@/lib/ratios";
import styles from "./TrendArrow.module.css";

const CONFIG: Record<Trend, { symbol: string; label: string; className: string }> = {
  improving: { symbol: "↑", label: "Improving", className: "improving" },
  declining: { symbol: "↓", label: "Declining", className: "declining" },
  stable: { symbol: "→", label: "Stable", className: "stable" },
  insufficient_data: { symbol: "—", label: "Not enough data", className: "unknown" },
};

export function TrendArrow({ trend }: { trend: Trend }) {
  const { symbol, label, className } = CONFIG[trend];
  return (
    <span className={`${styles.trend} ${styles[className]}`} title={label}>
      <span aria-hidden="true">{symbol}</span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}
