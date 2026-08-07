import { complete } from "./llm";
import { retrieveNotes, retrieveNotesBatch, type KBNote } from "./retrieve";
import { RATIO_META, type Category, type RatioId, type RatioResult } from "./ratios";
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
export function buildAllowedNumbers(ratios: RatioResult[], notesText: string): Set<number> {
  const allowed = new Set<number>();
  for (const r of ratios) {
    // A not_meaningful ratio is named in the prompt without any number, so
    // an older ok year of it must not become quotable.
    if (r.latestStatus === "not_meaningful") continue;
    const latest = latestOkYear(r);
    if (latest) {
      allowed.add(latest.fiscalYear);
      allowed.add(latest.value);
    }
  }
  for (const n of extractNumbers(notesText)) allowed.add(n);
  return allowed;
}

const NUMBER_GUARD_TOLERANCE = 0.05;

export function passesNumberGuard(text: string, allowed: Set<number>): boolean {
  for (const n of extractNumbers(text)) {
    const ok = [...allowed].some((a) => Math.abs(a - n) < NUMBER_GUARD_TOLERANCE);
    if (!ok) return false;
  }
  return true;
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
    if (!passesNumberGuard(text, allowed)) {
      console.warn(`explainCategory: dropped explanation for ${r.id} — failed number guard`);
      continue;
    }
    result[r.id] = text.trim();
  }
  return result;
}

export interface ExplainSingleRatioInput {
  ratioId: RatioId;
  value: number;
  sector: string | null;
}

/** Ad-hoc single-ratio explanation for the MCP `explain_ratio` tool (§11a).
 * Unlike explainCategory, there's no multi-year trend or company behind
 * this — just a bare ratio name, value, and sector — so it isn't batched
 * and asks for plain text back instead of JSON. Throws on generation
 * failure or a number-guard rejection; the MCP tool surfaces that directly
 * rather than silently returning nothing. */
export async function explainSingleRatio(input: ExplainSingleRatioInput): Promise<string> {
  const meta = RATIO_META[input.ratioId];
  const formattedValue = formatRatioValue({ unit: meta.unit, latestValue: input.value });

  const notes = await retrieveNotes({
    ratioId: input.ratioId,
    ratioLabel: meta.label,
    formattedValue,
    trend: "insufficient_data",
    category: meta.category,
    sector: input.sector,
  });
  const notesText = notes.map((n) => `[${n.id}] ${n.text}`).join("\n\n");

  const prompt = `SECTOR: ${input.sector ?? "not specified"}

RATIO: ${meta.label}: ${formattedValue}

REFERENCE NOTES:
${notesText || "(none retrieved)"}

Write 2-3 sentences explaining what this ratio means and whether this level
is healthy given the sector.

Rules:
- Use only the number given above (${formattedValue}). Do not calculate anything.
- If the reference notes mention a sector exception that applies here, say so.
- Do not give investment advice or suggest buying or selling.
- Respond with plain text only — no JSON, no markdown.`;

  const text = await complete({
    system:
      "You explain company financial ratios to a non-expert. Never state a different number than the one given.",
    prompt,
    temperature: 0.3,
  });

  const allowed = new Set<number>([input.value, ...extractNumbers(notesText)]);
  if (!passesNumberGuard(text, allowed)) {
    throw new Error(
      "Generated explanation failed the number guard (it introduced a number not in the given context) and was discarded.",
    );
  }
  return text.trim();
}
