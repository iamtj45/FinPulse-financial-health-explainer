import { complete } from "./llm";
import { retrieveNotesBatch, type KBNote } from "./retrieve";
import type { Category, RatioResult } from "./ratios";
import { formatRatioValue, unavailableReason } from "./format";

export interface ExplainCategoryInput {
  companyName: string;
  sector: string | null;
  category: Category;
  ratios: RatioResult[];
}

/** ratioId -> explanation text. A ratio is absent from the result if
 * generation failed, its JSON key was missing, or the number guard (§8)
 * dropped it — callers show the ratio without commentary in that case,
 * never a placeholder claiming success. */
export type Explanations = Record<string, string>;

interface LatestOkYear {
  fiscalYear: number;
  value: number;
}

function latestOkYear(ratio: RatioResult): LatestOkYear | null {
  const ok = ratio.years.filter((y) => y.status === "ok" && y.value !== null);
  const last = ok[ok.length - 1];
  return last ? { fiscalYear: last.fiscalYear, value: last.value as number } : null;
}

const NUMBER_PATTERN = /-?\d+(?:,\d{3})*(?:\.\d+)?%?/g;

export function extractNumbers(text: string): number[] {
  const matches = text.match(NUMBER_PATTERN) ?? [];
  return matches
    .map((m) => Number(m.replace(/,/g, "").replace(/%$/, "")))
    .filter((n) => Number.isFinite(n));
}

/** The only numbers a generated explanation is allowed to contain: the
 * ratio values and fiscal years actually shown to the model, plus any
 * number quoted in the retrieved notes it was given as reference (§8). */
/** The units ratio-language is written in, not financial claims: "$7.20 of
 * debt for every $1 of equity", "$0.71 of every revenue dollar", "out of
 * 100". The guard threw away a correct debt-to-equity explanation over the
 * "1" in "every $1". Nothing can be fabricated with these. */
const RHETORICAL_CONSTANTS = [0, 1, 100];

export function buildAllowedNumbers(ratios: RatioResult[], notesText: string): Set<number> {
  const allowed = new Set<number>(RHETORICAL_CONSTANTS);
  for (const r of ratios) {
    // Every fiscal year in the report is quotable, not just the latest. The
    // prompt states a trend and asks what it suggests, which invites "from
    // 2022 to 2025" — and with only 2025 allowed, that otherwise-correct
    // sentence was thrown away. A year is a date, not a financial claim,
    // so admitting the ones this report covers costs the guard nothing.
    for (const y of r.years) allowed.add(y.fiscalYear);

    // A not_meaningful ratio is named in the prompt without any number, so
    // an older ok year of it must not become quotable.
    if (r.latestStatus === "not_meaningful") continue;
    const latest = latestOkYear(r);
    if (latest) {
      allowed.add(latest.fiscalYear);
      allowed.add(latest.value);

      // The prompt shows the FORMATTED value, so that is the form the model
      // reads back. Free cash flow reaches it as "$108.8B" and is stored
      // here as 108800000000, and 108.8 matches neither that nor any fiscal
      // year — so the guard called every currency explanation a fabrication
      // and dropped it, every time. Admit the formatted digits too.
      for (const n of extractNumbers(formatRatioValue(r))) allowed.add(n);

      // 0.85 and "85%" are one number wearing two units, not two claims.
      // The model restates a ratio as a percentage constantly — "an
      // operating cash ratio of 0.85 ... covers 85% of current
      // liabilities" — and the guard was calling that second figure a
      // fabrication and deleting the whole explanation over it.
      if (r.unit === "ratio") allowed.add(latest.value * 100);
      else if (r.unit === "percent") allowed.add(latest.value / 100);
    }
  }
  for (const n of extractNumbers(notesText)) allowed.add(n);
  return allowed;
}

const NUMBER_GUARD_TOLERANCE = 0.05;

/** The first number in `text` that wasn't among those given to the model,
 * or null if every number checks out. Returning the offending value rather
 * than a bare boolean is what lets the dropped-explanation warning say what
 * was actually wrong — "failed number guard" alone gives you nothing to act
 * on when a ratio silently loses its commentary. */
/** Whether a number the model wrote is one it was given.
 *
 * Exact match within a hair, or the given number read to fewer decimal
 * places. Models round constantly for readability — an operating margin of
 * 12.7% becomes "roughly 13%", a net margin of 8.6% becomes "about 9 cents
 * on the dollar" — and treating that as invention was the single biggest
 * cause of ratios rendering with no commentary at all. Rounding restates a
 * number the model was handed; it never introduces a new one, which is the
 * only thing this guard exists to catch.
 *
 * The rounding is applied to the ALLOWED value, at the precision the model
 * actually wrote. So 12.7 matches "13", but 2025 never matches "2015" and
 * 1.84 never matches "4.2" — a wrong number stays wrong at every precision. */
function matchesAllowed(written: number, allowed: number): boolean {
  if (Math.abs(allowed - written) < NUMBER_GUARD_TOLERANCE) return true;
  const decimals = (String(written).split(".")[1] ?? "").length;
  return Number(allowed.toFixed(decimals)) === written;
}

export function findDisallowedNumber(text: string, allowed: Set<number>): number | null {
  for (const n of extractNumbers(text)) {
    const ok = [...allowed].some((a) => matchesAllowed(n, a));
    if (!ok) return n;
  }
  return null;
}

export function passesNumberGuard(text: string, allowed: Set<number>): boolean {
  return findDisallowedNumber(text, allowed) === null;
}

function buildPrompt(
  input: ExplainCategoryInput,
  notesByRatio: Map<string, KBNote[]>,
): { system: string; prompt: string; notesText: string } {
  const system =
    "You explain company financial ratios to a non-expert. You are given ratios that have ALREADY been computed. Never recompute, never state a different number than the one given.";

  const ratioLines = input.ratios
    .map((r) => {
      if (r.latestStatus === "not_meaningful") {
        return `- ${r.label}: not_meaningful (${unavailableReason(r)}) — no value computed`;
      }
      const latest = latestOkYear(r);
      const yearLabel = latest ? `${formatRatioValue(r)} (${latest.fiscalYear})` : formatRatioValue(r);
      return `- ${r.label}: ${yearLabel}, trend: ${r.trend}`;
    })
    .join("\n");

  const dedupedNotes: KBNote[] = [];
  const seen = new Set<string>();
  for (const r of input.ratios) {
    for (const note of notesByRatio.get(r.id) ?? []) {
      if (seen.has(note.id)) continue;
      seen.add(note.id);
      dedupedNotes.push(note);
    }
  }
  const notesText = dedupedNotes.map((n) => `[${n.id}] ${n.text}`).join("\n\n");

  const ratioIds = input.ratios.map((r) => `"${r.id}"`).join(", ");

  const prompt = `COMPANY: ${input.companyName} (${input.sector ?? "sector not reported"})

COMPUTED RATIOS:
${ratioLines}

REFERENCE NOTES:
${notesText || "(none retrieved)"}

For each ratio, write 2-3 sentences: what it means for this company, whether
the level is healthy given the sector, and what the trend suggests.

Rules:
- Use only the numbers given above. Do not calculate anything.
- If the reference notes mention a sector exception that applies here, say so.
- Do not give investment advice or suggest buying or selling.
- If a ratio's trend is insufficient_data, say there isn't enough history yet rather than describing a trend.
- If a ratio is marked not_meaningful, explain why the arithmetic is misleading here rather than interpreting it, and do not state a value for it.

Respond with ONLY a JSON object mapping each ratio id to its explanation
string — no markdown code fences, no commentary outside the JSON. Keys must
be exactly: ${ratioIds}.`;

  return { system, prompt, notesText };
}

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One call per ratio group (§8): retrieves KB notes for every ratio in the
 * category, generates all of that category's explanations in a single LLM
 * call, and drops any explanation that fails the number guard.
 *
 * Throws if generation itself couldn't run (no provider configured,
 * network failure, unparseable response) — callers decide how to degrade.
 * lib/cachedData.ts deliberately does NOT cache that outcome, so a request
 * made before API keys are configured doesn't poison the cache for every
 * request after. A per-ratio guard drop is different: that's a completed,
 * reproducible generation, not a failure, so it's returned normally (and
 * is safe to cache) even if it leaves some ratios unexplained. */
export async function explainCategory(input: ExplainCategoryInput): Promise<Explanations> {
  const explainable = input.ratios.filter(
    (r) => r.latestStatus === "ok" || r.latestStatus === "not_meaningful",
  );
  if (explainable.length === 0) return {};

  const contexts = explainable.map((r) => ({
    ratioId: r.id,
    ratioLabel: r.label,
    formattedValue:
      r.latestStatus === "not_meaningful" ? unavailableReason(r) : formatRatioValue(r),
    trend: r.trend,
    category: input.category,
    sector: input.sector,
  }));
  const notesPerRatio = await retrieveNotesBatch(contexts);
  const notesByRatio = new Map<string, KBNote[]>(
    explainable.map((r, i) => [r.id, notesPerRatio[i]]),
  );

  const { system, prompt, notesText } = buildPrompt(
    { ...input, ratios: explainable },
    notesByRatio,
  );
  const allowed = buildAllowedNumbers(explainable, notesText);

  const raw = await complete({ system, prompt, temperature: 0.3 });
  const parsed = parseJsonResponse(raw);
  if (!parsed) {
    throw new Error(
      `explainCategory: model response for category "${input.category}" was not valid JSON: ${raw.slice(0, 300)}`,
    );
  }

  const result: Explanations = {};
  for (const r of explainable) {
    const text = parsed[r.id];
    if (typeof text !== "string" || !text.trim()) continue;
    const offending = findDisallowedNumber(text, allowed);
    if (offending !== null) {
      console.warn(
        `explainCategory: dropped explanation for ${r.id} — number guard rejected ${offending}, ` +
          `which is not among the numbers the model was given. Text: ${text.slice(0, 200)}`,
      );
      continue;
    }
    result[r.id] = text.trim();
  }
  return result;
}

