import type { StatementYear } from "@/lib/yahoo";
import { formatInputValue } from "@/lib/format";
import styles from "./InputsPanel.module.css";

const FIELD_LABELS: { key: keyof StatementYear; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "grossProfit", label: "Gross profit" },
  { key: "operatingIncome", label: "Operating income" },
  { key: "netIncome", label: "Net income" },
  { key: "currentAssets", label: "Current assets" },
  { key: "currentLiabilities", label: "Current liabilities" },
  { key: "totalAssets", label: "Total assets" },
  { key: "totalLiabilities", label: "Total liabilities" },
  { key: "totalEquity", label: "Total equity" },
  { key: "inventory", label: "Inventory" },
  { key: "cash", label: "Cash" },
  { key: "operatingCashFlow", label: "Operating cash flow" },
  { key: "capitalExpenditure", label: "Capital expenditure" },
];

export function InputsPanel({ years }: { years: StatementYear[] }) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Inputs used</summary>
      <p className={styles.note}>
        The raw line items each ratio above was computed from, as reported for
        each fiscal year.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Line item</th>
              {years.map((y) => (
                <th scope="col" key={y.fiscalYear}>
                  FY{y.fiscalYear}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_LABELS.map(({ key, label }) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                {years.map((y) => (
                  <td key={y.fiscalYear}>{formatInputValue(y[key] as number | null)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
