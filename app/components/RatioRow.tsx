import type { RatioResult } from "@/lib/ratios";
import { formatRatioValue, unavailableReason } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { TrendArrow } from "./TrendArrow";
import styles from "./RatioRow.module.css";

/** `explanation` is tri-state: omit it entirely for "no explanation layer
 * running" (nothing renders), pass 'pending' while a generation call is in
 * flight, or pass the generated text once it resolves. */
export function RatioRow({
  ratio,
  explanation,
}: {
  ratio: RatioResult;
  explanation?: string | "pending";
}) {
  const isAvailable = ratio.latestStatus === "ok";

  return (
    <div className={styles.row}>
      <div className={styles.top}>
        <span className={styles.name}>{ratio.label}</span>

        {isAvailable ? (
          <>
            <span className={styles.value}>{formatRatioValue(ratio)}</span>
            <Sparkline years={ratio.years} />
            <TrendArrow trend={ratio.trend} />
          </>
        ) : (
          <span className={styles.unavailable}>
            Not reported <span className={styles.reason}>({unavailableReason(ratio)})</span>
          </span>
        )}
      </div>

      {isAvailable && explanation && (
        <p className={styles.explanation}>
          {explanation === "pending" ? (
            <span className={styles.pending}>Generating explanation…</span>
          ) : (
            explanation
          )}
        </p>
      )}
    </div>
  );
}
