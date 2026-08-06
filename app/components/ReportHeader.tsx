import type { CompanyFinancials } from "@/lib/yahoo";
import { formatMarketCap } from "@/lib/format";
import styles from "./ReportHeader.module.css";

export function ReportHeader({ financials }: { financials: CompanyFinancials }) {
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <h1>{financials.companyName}</h1>
        <span className={styles.ticker}>{financials.ticker}</span>
      </div>
      <div className={styles.meta}>
        <span>{financials.sector ?? "Sector not reported"}</span>
        <span aria-hidden="true">·</span>
        <span>{financials.industry ?? "Industry not reported"}</span>
        <span aria-hidden="true">·</span>
        <span>Market cap {formatMarketCap(financials.marketCap)}</span>
      </div>
    </header>
  );
}
