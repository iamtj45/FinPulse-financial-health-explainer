import type { Verdict } from "@/lib/health";
import styles from "./VerdictChip.module.css";

const LABEL: Record<Verdict, string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
  unavailable: "Unavailable",
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`${styles.chip} ${styles[verdict]}`}>{LABEL[verdict]}</span>
  );
}
