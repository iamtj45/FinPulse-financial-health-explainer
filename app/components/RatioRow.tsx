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
  const hasValue = ratio.latestStatus === "ok";

  // "Not meaningful" is a distinct state from "not reported": the inputs were
  // filed, the arithmetic is just misleading (§5). Saying "not reported"
  // there would misdescribe the company's disclosure.
  const unavailableLabel =
    ratio.latestStatus === "not_meaningful" ? "Not meaningful" : "Not reported";

  return (
    <div className={styles.row}>
      <div className={styles.top}>
        <span className={styles.name}>{ratio.label}</span>

        {hasValue ? (
          <>
            <span className={styles.value}>{formatRatioValue(ratio)}</span>
            <Sparkline years={ratio.years} />
            <TrendArrow trend={ratio.trend} />
          </>
        ) : (
          <span className={styles.unavailable}>
            {unavailableLabel}{" "}
            <span className={styles.reason}>({unavailableReason(ratio)})</span>
          </span>
        )}
      </div>

      {explanation && (
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
