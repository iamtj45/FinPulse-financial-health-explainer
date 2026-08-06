# FinPulse — build specification

A company financial health explainer. Enter a ticker, get the standard
financial ratios computed from real filings data, a three-year trend, and a
plain-English explanation of what each number means and whether it looks
healthy.

Target: **Next.js on Vercel**, deployed and public.

This document is the complete spec. Build from it directly.

---

## 1. What this is and is not

**It is** a tool that computes well-defined financial ratios from real data
and explains them using a curated knowledge base written by the project owner.

**It is not** a stock price predictor, a buy/sell recommender, or a trading
signal generator. Do not add price forecasting, technical indicators, or
sentiment scoring. The output is explanation, not prediction.

Every screen must carry the line: *"Educational tool. Not investment advice."*

---

## 2. The design principle

**Numbers are computed deterministically. The language model only explains
them.**

Ratios are arithmetic over known inputs — current ratio is current assets over
current liabilities, and that never needs a model. All computation happens in
TypeScript from the fetched financial statements.

The model's only job: given a computed ratio, its value, its trend, and the
relevant notes retrieved from the knowledge base, write two or three sentences
explaining what it means for this company.

This means the model can never produce a wrong number. It can only produce a
weak explanation, which is a far less serious failure and is visible on
inspection.

---

## 3. Non-goals

Do not build these:

- User accounts, authentication, saved portfolios
- Price charts or any market-price data
- Multi-company comparison (phase 2 at most)
- Chat interface or follow-up conversation
- PDF parsing of any kind
- A database — see §6

Scope: **one ticker at a time, US-listed companies, three years of annual
data.**

---

## 4. Data source

Financial statements come from Yahoo Finance. No API key, no cost.

Because the deployed runtime is Node, use a JavaScript client rather than
Python's `yfinance` — `yahoo-finance2` on npm is the standard choice and
returns typed results.

Fetch three statements, annual, last 3–4 years:

- Income statement — revenue, gross profit, operating income, net income
- Balance sheet — current assets, current liabilities, total assets, total
  liabilities, total equity, inventory, cash
- Cash flow — operating cash flow, capital expenditure

Also fetch: company name, sector, industry, market cap.

**Handle missing fields explicitly.** Coverage varies by company and sector —
banks report differently, some fields are simply absent. A missing input means
that ratio is reported as unavailable, never estimated or defaulted to zero.

Cache responses (§9). The upstream source is unofficial and rate-limits.

---

## 5. Ratios to compute

Group into four categories. Each ratio needs: a value, the inputs it came
from, a three-year trend, and a health verdict.

### Liquidity
| Ratio | Formula |
|---|---|
| Current ratio | current assets / current liabilities |
| Quick ratio | (current assets − inventory) / current liabilities |

### Profitability
| Ratio | Formula |
|---|---|
| Gross margin | gross profit / revenue |
| Operating margin | operating income / revenue |
| Net margin | net income / revenue |
| Return on equity | net income / total equity |

### Leverage
| Ratio | Formula |
|---|---|
| Debt to equity | total liabilities / total equity |
| Equity ratio | total equity / total assets |

### Cash
| Ratio | Formula |
|---|---|
| Free cash flow | operating cash flow − capital expenditure |
| FCF margin | free cash flow / revenue |
| Operating cash ratio | operating cash flow / current liabilities |

**Rules for the compute layer:**

- Return `null`, not `0`, when an input is missing
- Guard every division against a zero or null denominator
- Negative equity makes debt-to-equity and ROE meaningless — flag as
  `not_meaningful`, do not display a number
- Round to two decimals for ratios, one decimal for percentages
- Trend is computed over available years: `improving`, `declining`, `stable`
  (within ±5%), or `insufficient_data`

Write this module with unit tests. It is pure arithmetic with no external
dependency, so it is fully testable, and correctness here is the foundation of
the whole tool.

---

## 6. The knowledge base

**This is the project owner's contribution and must be written by hand, not
generated.**

A set of short notes, one file per ratio plus general notes, stored as
markdown with frontmatter in `content/kb/`.

```markdown
---
id: current-ratio
ratio: current_ratio
tags: [liquidity, short-term]
---

The current ratio measures whether a company can cover its short-term
obligations with short-term assets.

Below 1.0 means current liabilities exceed current assets, which can signal
strain — though it is normal in businesses that collect cash before paying
suppliers, such as grocery and restaurant chains.

Between 1.5 and 3.0 is generally comfortable for most industries.

Above 3.0 is not automatically good. It can indicate capital sitting idle
rather than being deployed.

Software companies commonly run high current ratios because they carry no
inventory and hold large cash balances.
```

**Target 35–45 notes.** Cover: each ratio's meaning, its healthy range, the
sector exceptions, what a declining trend implies, and the common
misinterpretations.

Every threshold stated in these notes is a judgment call by the author, and
the README should say so.

### Retrieval — semantic, required

**Build this with embeddings. Tag matching is not acceptable as the shipped
approach.** The corpus is small enough that keyword matching would mostly
work, which is exactly why it must not be the implementation — a retrieval
layer that is really a dictionary lookup should not be described as retrieval.

At 40 short notes the entire knowledge base fits in one JSON file of a few
hundred kilobytes.

**Build time** (`scripts/build-kb-index.ts`):

1. Read every markdown file in `content/kb/`
2. Embed the body text of each note
3. Write `content/kb-index.json`, committed:

```json
{
  "model": "<embedding model, recorded so mismatches are detectable>",
  "dim": 1024,
  "notes": [
    {
      "id": "current-ratio",
      "ratio": "current_ratio",
      "tags": ["liquidity", "short-term"],
      "text": "...",
      "vector": [0.013, -0.229, ...]
    }
  ]
}
```

**Request time** (`lib/retrieve.ts`):

1. Build a query string from the computed context, not just the ratio name —
   e.g. `"current ratio 1.84 improving trend software sector liquidity"`.
   Including the sector and trend is what lets a sector-exception note surface
   above the generic definition.
2. Embed the query
3. Cosine similarity across all notes, in memory
4. Return top 3

No vector database. A few hundred vectors compared in a loop takes under a
millisecond.

**Use the same embedding model at build time and query time.** A mismatch
produces silently poor retrieval with no error raised. The `model` field in
the index exists so this can be asserted at startup — do assert it.

Tag matching may be kept as an emergency fallback if the embedding call fails
at request time, but the primary path is semantic.

---

## 7. Provider configuration

Provider-agnostic. Write against the **OpenAI SDK**, never a vendor SDK — Groq,
Cerebras, Mistral, OpenRouter and DeepSeek all expose OpenAI-compatible
endpoints, so the provider is a base URL.

```
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=

LLM_FALLBACK_BASE_URL=
LLM_FALLBACK_API_KEY=
LLM_FALLBACK_MODEL=

EMBED_PROVIDER=
EMBED_API_KEY=
EMBED_MODEL=
```

Implement `complete()` in `lib/llm.ts` that tries the primary and falls back on
rate-limit or 5xx errors. That is the only file permitted to import an LLM SDK.

### Recommended providers

**Generation: Groq primary, Cerebras fallback.** Both are free with no credit
card and both are OpenAI-compatible.

The selection criterion here is latency, not throughput — a user is waiting
while the page renders, and there is no eval sweep to fund. Groq is the
fastest free option available.

```
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile

LLM_FALLBACK_BASE_URL=https://api.cerebras.ai/v1
```

**Token budget.** Groq's free tier for that model allows roughly 30
requests/min, 1,000/day, and 100K tokens/day. At four generation calls per
report and ~1.3K tokens each, one company report costs about 5K tokens —
around **19 fresh companies per day**. Caching (§9) means repeat tickers cost
nothing, so this is comfortable for a demo. The Cerebras fallback covers a
traffic spike if the link gets shared.

**Embeddings: Jina or Cohere.** Neither Groq nor Cerebras serves embeddings,
so this is a separate key. Jina's free tier allows around 1M tokens/month;
Cohere's trial allows roughly 1,000 calls/month and batches many texts per
call. Either is far more than this project needs — the knowledge base is
~8K tokens embedded once per deploy, plus one short query string per request.

Verify current model names and limits in each console before wiring; free-tier
catalogues change and providers do quietly remove models.

**Load characteristics differ from a benchmark project.** There is no eval
sweep here, so daily token ceilings matter less than latency. Optimise for
time-to-first-explanation.

Never hardcode a model name — a rename must be a config edit.

---

## 8. Explanation generation

One call per ratio group, not per ratio — four calls per company, batched.

### Prompt structure

```
You explain company financial ratios to a non-expert. You are given ratios
that have ALREADY been computed. Never recompute, never state a different
number than the one given.

COMPANY: {name} ({sector})

COMPUTED RATIOS:
- Current ratio: 1.84 (2024), trend: improving
- Quick ratio: 1.12 (2024), trend: stable

REFERENCE NOTES:
{retrieved knowledge base notes}

For each ratio, write 2-3 sentences: what it means for this company, whether
the level is healthy given the sector, and what the trend suggests.

Rules:
- Use only the numbers given above. Do not calculate anything.
- If the reference notes mention a sector exception that applies here, say so.
- Do not give investment advice or suggest buying or selling.
- If a ratio is marked not_meaningful, explain why rather than interpreting it.
```

Temperature 0.3 — slightly above zero, since this is prose rather than
extraction.

### Post-generation guard

Scan the generated text for numbers. Every numeric token must either appear in
the supplied ratio set or be a threshold quoted from a retrieved note. If the
model invents a figure, drop that explanation and show the ratio without
commentary rather than showing a fabricated number.

This is roughly 20 lines and it is what makes the tool trustworthy.

---

## 9. Caching

Financial statements change quarterly at most. Explanations for the same
inputs are identical.

- Cache the fetched statements per ticker, 24-hour TTL
- Cache generated explanations keyed by a hash of the computed ratio values —
  same numbers means the same explanation, no second call
- Use Next.js route segment caching, or Vercel KV if available on the plan

Without caching, a demo where someone types `AAPL` three times burns three
sets of LLM calls for identical output.

---

## 10. Routes and structure

```
finpulse/
├── README.md
├── SPEC.md
├── .env.example
├── app/
│   ├── page.tsx                 ticker entry
│   ├── [ticker]/page.tsx        the report
│   └── api/
│       ├── financials/route.ts  fetch + compute
│       └── explain/route.ts     retrieve + generate
├── lib/
│   ├── yahoo.ts                 data fetching, field mapping
│   ├── ratios.ts                pure computation  ← unit tested
│   ├── health.ts                verdict thresholds
│   ├── retrieve.ts              KB search
│   └── llm.ts                   provider wrapper
├── content/
│   ├── kb/                      hand-written notes
│   └── kb-index.json            committed, built by script
├── scripts/
│   └── build-kb-index.ts        embeds notes at build time
├── mcp/
│   └── server.ts                MCP server (built last)
└── __tests__/
    └── ratios.test.ts
```

---

## 11. UI

Server-rendered, one page per ticker at `/AAPL`. Shareable URLs matter more
than interactivity here.

Layout, top to bottom:

1. **Header** — company name, ticker, sector, market cap
2. **Health summary** — four category cards (liquidity, profitability,
   leverage, cash), each with a verdict chip: strong / adequate / weak /
   unavailable
3. **Ratio sections** — one per category. Each ratio row shows: name, current
   value, a small three-year sparkline, trend arrow, and the generated
   explanation beneath
4. **Inputs used** — collapsible. The raw line items each ratio was computed
   from, with the fiscal year. This is the "show your work" panel and it is
   what separates this from a black box
5. **Footer** — data source, last fetched timestamp, the not-investment-advice
   line

Design notes:

- Explanations render progressively — show computed ratios immediately, stream
  or fill in explanations as they arrive. Never block the whole page on the
  LLM
- Unavailable ratios show "not reported" with a reason, never a blank or a zero
- Keep it to two colours plus neutral. Green/amber/red on verdict chips only

---

## 11a. MCP server

Build after step 10, once the web app works. Roughly 60 lines.

Location: `mcp/server.ts`. Official MCP SDK, stdio transport.

Three tools, all thin wrappers over logic that already exists:

| Tool | Input | Returns |
|---|---|---|
| `analyze_ticker` | ticker | full report: ratios, verdicts, explanations |
| `get_ratios` | ticker | computed ratios only, no LLM call |
| `explain_ratio` | ratio name, value, sector | one explanation |

`get_ratios` deliberately skips generation — an agent chaining calls usually
wants the numbers, not the prose, and this keeps that path fast and free.

This is a genuine capability rather than a wrapper for its own sake: an agent
can pull a company's financial health into a larger workflow — screening a
list of tickers, or checking a company mentioned in a document.

Test it by connecting to Claude Desktop and asking a question that requires
chaining two calls. That interaction is also the best demo video for the
README.

---

## 11b. On orchestration frameworks

**Do not add LangChain or LangGraph to this project.**

The flow is linear: fetch → compute → retrieve → generate. There are no
retries, no conditional branches, and no state carried between steps. Those
frameworks exist to manage control flow, and this project has none to manage.

Adding one would mean a dependency, an abstraction layer, and a question in
every code review that has no good answer. Plain functions and `Promise.all`
are the correct implementation here.

If the retrieval step later needs retry-on-low-confidence, or explanation
needs a verification loop, revisit this. Until then, no.

---



## 12. Vercel deployment

This project is deliberately shaped to deploy cleanly.

- **No database.** Knowledge base index is a committed JSON file, financial
  data is fetched per request and cached.
- **No Python, no ML libraries.** Embeddings happen at build time via API;
  nothing heavy ships in the function bundle.
- **Within the timeout.** One data fetch plus four generation calls. Run the
  four in parallel with `Promise.all`. Return computed ratios first and load
  explanations client-side if the total approaches 10 seconds on the hobby
  plan.

Set environment variables in the Vercel dashboard, not in a committed file.

Note that the Vercel hobby plan prohibits commercial use — fine for a
portfolio project, worth knowing.

---

## 13. Build order

1. `lib/yahoo.ts` — fetch one ticker, log the raw shape, map fields
2. `lib/ratios.ts` + tests — **pure arithmetic, get this exactly right first**
3. `lib/health.ts` — verdict thresholds
4. Static page rendering ratios with no explanations at all
5. Write the knowledge base — **by hand, ~40 notes**
6. `scripts/build-kb-index.ts` and `lib/retrieve.ts`
7. `lib/llm.ts` and the explain route
8. The number guard (§8)
9. Caching
10. Deploy to Vercel
11. MCP server (§11a)

**Step 4 is a working product.** Everything after it is enhancement. If time
runs short, a clean ratio dashboard with no LLM at all is still a finished
tool.

---

## 14. README requirements

```
FinPulse
├── One-paragraph description + screenshot
├── Live demo link
├── How it works — the compute/explain split
├── The knowledge base — why hand-written, how thresholds were chosen
├── Sector caveats and known limitations
├── Not investment advice
└── Run locally in 3 commands
```

State plainly: US-listed companies only, annual data only, coverage gaps for
financial-sector companies, thresholds are the author's judgment and are
documented in `content/kb/`.

---

## 15. Division of work

**Written by the project owner, not generated:**

- The entire knowledge base (§6) — this is the substance of the tool
- The health verdict thresholds in `lib/health.ts` and the reasoning for them
- The ratio selection: which ones matter and why these and not others

**Assembly, suitable for delegation:**

- Yahoo Finance client and field mapping
- Next.js routes, layout, components
- The provider wrapper and caching
- Test scaffolding

The knowledge base is what makes this project the owner's. Anyone can wire an
API to a model; the judgment about what "healthy" means in each sector is
domain reasoning, written in plain text, and unmistakably authored.
