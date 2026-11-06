import type { Trend, TrendDirection } from "@/lib/ratios";
import styles from "./TrendArrow.module.css";

const VERDICT: Record<Trend, { label: string; className: string }> = {
  improving: { label: "Improving", className: "improving" },
  declining: { label: "Declining", className: "declining" },
  stable: { label: "Stable", className: "stable" },
  insufficient_data: { label: "Not enough data", className: "unknown" },
};

/** The arrow follows the VALUE, so it always agrees with the sparkline drawn
 * beside it. The wording and colour follow the health verdict.
 *
 * Those are the same thing for ten of the eleven ratios, which is why driving
 * the arrow from the verdict alone looked fine. On debt-to-equity it was
 * backwards on screen: paying down debt is "improving", so the arrow pointed
 * up while the sparkline of the actual values sloped down. Now a company
 * reducing leverage reads "down arrow, Improving, in green" — number fell,
 * and that is the healthy direction. */
const SYMBOL: Record<TrendDirection, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

const MOVEMENT: Record<TrendDirection, string> = {
  up: "value rose",
  down: "value fell",
  flat: "value held steady",
};

export function TrendArrow({ trend, direction }: { trend: Trend; direction: TrendDirection }) {
  const { label, className } = VERDICT[trend];

  // No two comparable years, so there is no movement to point at.
  const unknown = trend === "insufficient_data";
  const symbol = unknown ? "—" : SYMBOL[direction];
  const title = unknown ? label : `${label} — ${MOVEMENT[direction]} over the period`;

  return (
    <span className={`${styles.trend} ${styles[className]}`} title={title}>
      <span aria-hidden="true">{symbol}</span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}
