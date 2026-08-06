import Link from "next/link";
import styles from "./page.module.css";
import { goToTicker } from "./actions";

const EXAMPLES = ["AAPL", "MSFT", "KO", "JPM"];

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const errorParam = params.error;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  return (
    <div className="page-shell">
      <div className={styles.hero}>
        <h1>FinPulse</h1>
        <p className={styles.tagline}>
          A company financial health explainer. Enter a US-listed ticker to
          get standard financial ratios computed from real filings, a
          three-year trend, and a plain-English explanation of what each
          number means.
        </p>

        <form action={goToTicker} className={styles.form}>
          <input
            className={styles.input}
            type="text"
            name="ticker"
            placeholder="e.g. AAPL"
            maxLength={10}
            autoComplete="off"
            autoFocus
            aria-label="Ticker symbol"
          />
          <button className={styles.submit} type="submit">
            Analyze
          </button>
        </form>
        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.examples}>
          Try:{" "}
          {EXAMPLES.map((t) => (
            <Link key={t} href={`/${t}`}>
              {t}
            </Link>
          ))}
        </p>

        <p className={styles.scope}>
          US-listed companies, annual data, last 3-4 fiscal years. This tool
          computes ratios and explains them — it does not predict prices or
          recommend trades.
        </p>
      </div>
      <p className="disclaimer">Educational tool. Not investment advice.</p>
    </div>
  );
}
