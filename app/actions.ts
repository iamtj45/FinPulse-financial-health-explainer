"use server";

import { redirect } from "next/navigation";

const TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function goToTicker(formData: FormData): Promise<void> {
  const raw = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();

  if (!TICKER_PATTERN.test(raw)) {
    redirect(`/?error=${encodeURIComponent("Enter a valid US ticker symbol, e.g. AAPL")}`);
  }

  redirect(`/${raw}`);
}
