#!/usr/bin/env node
/**
 * FinPulse MCP server (§11a). Thin wrappers over the same lib/ logic the
 * web app uses — no Next.js dependency, so it runs as a plain stdio
 * process. Deliberately skips lib/cachedData.ts (Next-only) and calls the
 * underlying fetch/compute/explain functions directly.
 */
import { loadEnvForScripts } from "../lib/loadEnv";
loadEnvForScripts();

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchCompanyFinancials } from "../lib/yahoo";
import { computeRatios, groupByCategory, RATIO_IDS, type Category, type RatioId } from "../lib/ratios";
import { categoryVerdicts } from "../lib/health";
import { explainCategory, explainSingleRatio } from "../lib/explain";

const CATEGORY_ORDER: Category[] = ["liquidity", "profitability", "leverage", "cash"];

const server = new McpServer({ name: "finpulse", version: "0.1.0" });

server.registerTool(
  "get_ratios",
  {
    description:
      "Computed financial health ratios (liquidity, profitability, leverage, cash) with verdicts and trends for a US-listed ticker. No LLM call — fast and free.",
    inputSchema: { ticker: z.string().describe("Stock ticker, e.g. AAPL") },
  },
  async ({ ticker }) => {
    const financials = await fetchCompanyFinancials(ticker);
    const ratios = computeRatios(financials.years);
    const verdicts = categoryVerdicts(groupByCategory(ratios));
    return { content: [{ type: "text", text: JSON.stringify({ financials, ratios, verdicts }, null, 2) }] };
  },
);

server.registerTool(
  "analyze_ticker",
  {
    description:
      "Full financial health report for a US-listed ticker: computed ratios, verdicts, and a plain-English explanation for each ratio.",
    inputSchema: { ticker: z.string().describe("Stock ticker, e.g. AAPL") },
  },
  async ({ ticker }) => {
    const financials = await fetchCompanyFinancials(ticker);
    const ratios = computeRatios(financials.years);
    const grouped = groupByCategory(ratios);
    const verdicts = categoryVerdicts(grouped);

    const explanationEntries = await Promise.all(
      CATEGORY_ORDER.map(async (category) => {
        const explanations = await explainCategory({
          companyName: financials.companyName,
          sector: financials.sector,
          category,
          ratios: grouped[category],
        });
        return [category, explanations] as const;
      }),
    );

    const body = { financials, ratios, verdicts, explanations: Object.fromEntries(explanationEntries) };
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
  },
);

server.registerTool(
  "explain_ratio",
  {
    description: "One plain-English explanation for a single already-computed ratio value and sector.",
    inputSchema: {
      ratio: z.enum(RATIO_IDS as [string, ...string[]]).describe("Ratio id, e.g. current_ratio"),
      value: z.number().describe("The already-computed ratio value"),
      sector: z.string().optional().describe("Company sector, e.g. Technology"),
    },
  },
  async ({ ratio, value, sector }) => {
    const text = await explainSingleRatio({ ratioId: ratio as RatioId, value, sector: sector ?? null });
    return { content: [{ type: "text", text }] };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("FinPulse MCP server running on stdio");
}

main().catch((err) => {
  console.error("FinPulse MCP server failed to start:", err);
  process.exit(1);
});
