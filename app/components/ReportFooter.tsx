import styles from "./ReportFooter.module.css";

export function ReportFooter({ fetchedAt }: { fetchedAt: string }) {
  const fetched = new Date(fetchedAt);
  return (
    <footer className={styles.footer}>
      <p>
        Data source: Yahoo Finance, annual statements. Last fetched{" "}
        {fetched.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        .
      </p>
      <p className="disclaimer">Educational tool. Not investment advice.</p>
    </footer>
  );
}
