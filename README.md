# FinPulse

A company financial health explainer. Enter a US-listed ticker and get the
standard financial ratios — liquidity, profitability, leverage, cash —
computed from real filings, a multi-year trend, and a plain-English
explanation of what each number means and whether it looks healthy for that
company's sector.

## How it works

The core design principle: **numbers are computed deterministically, the
language model only explains them.**

```
ticker → fetch filings (Yahoo Finance) → compute ratios (pure TypeScript)
       → retrieve relevant notes (embeddings) → generate explanation (LLM)
```

- **Compute** (`lib/ratios.ts`) is plain arithmetic with no external
  dependency — current ratio is current assets over current liabilities,
  and that never needs a model. It's unit tested in `__tests__/ratios.test.ts`.
- **Explain** (`lib/explain.ts`) hands the model a ratio's value, its
  three/four-year trend, and the retrieved knowledge-base notes, and asks
  for 2-3 sentences. The model is never given raw financial statements and
  never asked to calculate anything.
- **The number guard** (also in `lib/explain.ts`) scans every generated
  explanation for numeric tokens and checks each one against the numbers
  actually supplied to the model. If the model invents a figure, that
  explanation is dropped and the ratio renders with no commentary rather
  than a fabricated number. This is what makes the tool trustworthy rather
  than merely fluent.

This split means the model can never produce a *wrong number* — only a weak
explanation, which is a far less serious failure and is visible on
inspection.

## The knowledge base

`content/kb/` holds 42 short, hand-written markdown notes — one or two per
ratio (its meaning and healthy range, its sector exceptions, common
misreadings), plus general notes on trend interpretation and the tool's own
limitations. These are the project's actual point of view: what counts as a
"healthy" current ratio, when a low gross margin is normal instead of
alarming, why negative equity breaks return-on-equity. Every threshold in
these notes is judgment, not law, and is written in plain language so it can
be checked and disagreed with.

The health-verdict thresholds in `lib/health.ts` are the same kind of
judgment call, applied as arithmetic bands (e.g. current ratio 1.5-3.0 reads
as "strong") — each is commented with the reasoning behind it.

Retrieval is semantic, not keyword matching: `scripts/build-kb-index.ts`
embeds every note once at build time into the committed
`content/kb-index.json`; `lib/retrieve.ts` embeds a query built from the
computed ratio's value, trend, sector, and category, then ranks notes by
cosine similarity. Tag matching only kicks in as an emergency fallback if
the embedding call itself fails at request time.

## Sector caveats and known limitations

- **US-listed companies only, annual data only**, last 3-4 fiscal years.
- **Banks and other financial institutions have real coverage gaps.**
  Current ratio, quick ratio, gross margin, operating margin, free cash
  flow, FCF margin, and operating cash ratio are typically unavailable for
  banks because "current assets," "inventory," and "capital expenditure"
  don't map onto how a bank reports (see `content/kb/sector-banks.md`).
  This is a missing-field-shows-as-unavailable design choice
  (`lib/ratios.ts`), never a silent zero or an estimate.
- **Three to four years is a short window.** It's enough to separate a real
  multi-year direction from one unusual year, but it won't reveal a longer
  commodity or real-estate cycle.
- **These ratios describe financial position, not investment merit.** None
  of them incorporate stock price, valuation, or market sentiment — see
  `content/kb/ratios-vs-stock-price.md`.
- **Thresholds and health verdicts are this project's judgment call**,
  documented (with reasoning) in `lib/health.ts` and `content/kb/`, not a
  universal standard.

## Not investment advice

FinPulse computes and explains reported financial ratios. It is not a stock
price predictor, a buy/sell recommender, or a trading signal generator, and
it does not give investment advice. **Educational tool. Not investment
advice.**

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in LLM_*/EMBED_* keys — see below
npm run dev
```

Open `http://localhost:3000`.

Ratios and the static report render with zero configuration — no key is
required to fetch filings or compute ratios. Explanations need two more
things:

1. **Generation + embedding keys** in `.env.local` — see `.env.example`.
   Recommended: [Groq](https://console.groq.com) (generation, primary),
   [Cerebras](https://cloud.cerebras.ai) (generation, fallback), and
   [Jina AI](https://jina.ai) or [Cohere](https://cohere.com) (embeddings).
   All four have free tiers with no credit card.
2. **Build the knowledge base index** once keys are set:
   ```bash
   npm run build-kb-index
   ```
   This embeds `content/kb/*.md` into `content/kb-index.json`, which is
   committed so the deployed app never re-embeds the knowledge base at
   request time.

Without an LLM key configured, the app still runs and still computes every
ratio correctly — it just renders each ratio without the generated
explanation paragraph, logging why in the server console. This is
deliberate graceful degradation (`lib/cachedData.ts`,
`lib/explain.ts`), not a broken build.

Run the test suite:

```bash
npm test
```

Run the MCP server (after the steps above):

```bash
npm run mcp
```

It exposes three tools — `analyze_ticker` (full report), `get_ratios`
(ratios only, no LLM call), and `explain_ratio` (one ad-hoc explanation) —
over stdio, for use with Claude Desktop or any other MCP client.

## Deploying

Deploys cleanly to Vercel: no database, no Python, and the knowledge base
index is a committed JSON file rather than a runtime dependency. Set the
`.env.example` variables in the Vercel dashboard (not in a committed file).
Note the Vercel hobby plan prohibits commercial use.

## Project structure

See `SPEC.md` for the full build specification this project was built
from, including the ratio formulas, the caching strategy, and the division
of work between hand-authored judgment (the knowledge base, the health
thresholds) and generated assembly (routes, the data client, the provider
wrapper).
