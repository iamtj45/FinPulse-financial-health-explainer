import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentEmbedModelId, embed } from "./embed";
import type { Category } from "./ratios";

export interface KBNote {
  id: string;
  ratio: string | null;
  tags: string[];
  text: string;
  vector: number[];
}

interface KBIndexFile {
  model: string;
  dim: number;
  notes: KBNote[];
}

export interface RetrievalContext {
  ratioId: string;
  ratioLabel: string;
  formattedValue: string;
  trend: string;
  category: Category;
  sector: string | null;
}

// `undefined` = not yet loaded, `null` = confirmed missing from disk.
let cachedIndex: KBIndexFile | null | undefined;

function loadIndex(): KBIndexFile | null {
  if (cachedIndex !== undefined) return cachedIndex;

  const path = resolve(process.cwd(), "content/kb-index.json");
  if (!existsSync(path)) {
    console.warn(
      `content/kb-index.json not found — run "npm run build-kb-index" after setting EMBED_* env vars. Explanations will run without retrieved notes until then.`,
    );
    cachedIndex = null;
    return null;
  }

  cachedIndex = JSON.parse(readFileSync(path, "utf-8")) as KBIndexFile;
  return cachedIndex;
}

/** A mismatch between the model that built the index and the model
 * currently configured produces silently poor retrieval with no error
 * otherwise — this is the assertion §6 explicitly calls for. */
function assertModelMatches(index: KBIndexFile): void {
  const expected = currentEmbedModelId();
  if (index.model !== expected) {
    throw new Error(
      `Embedding model mismatch: content/kb-index.json was built with "${index.model}" ` +
        `but the current EMBED_PROVIDER/EMBED_MODEL resolve to "${expected}". ` +
        `Re-run "npm run build-kb-index".`,
    );
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Built from the full computed context, not just the ratio name — this is
 * what lets a sector-exception note outrank the generic definition (§6). */
export function buildQueryText(ctx: RetrievalContext): string {
  const sector = ctx.sector ? ctx.sector.toLowerCase() : "";
  return `${ctx.ratioLabel.toLowerCase()} ${ctx.formattedValue} ${ctx.trend} trend ${sector} sector ${ctx.category}`
    .replace(/\s+/g, " ")
    .trim();
}

const SECTOR_KEYWORD_TAGS: [needle: string, tag: string][] = [
  ["bank", "banks"],
  ["software", "software"],
  ["grocery", "retail"],
  ["retail", "retail"],
  ["utilit", "utilities"],
  ["real estate", "real-estate"],
  ["reit", "real-estate"],
];

/** Emergency fallback for when the embedding call itself fails at request
 * time (§6) — not the primary retrieval path. Ranks by exact ratio match
 * first, then by tag overlap with category/sector. */
function fallbackTagMatch(ctx: RetrievalContext, notes: KBNote[], k: number): KBNote[] {
  const queryTags = new Set<string>([ctx.category]);
  const sectorLower = (ctx.sector ?? "").toLowerCase();
  for (const [needle, tag] of SECTOR_KEYWORD_TAGS) {
    if (sectorLower.includes(needle)) queryTags.add(tag);
  }

  return notes
    .map((note) => {
      const tagScore = note.tags.filter((t) => queryTags.has(t)).length;
      const ratioBonus = note.ratio === ctx.ratioId ? 3 : 0;
      return { note, score: tagScore + ratioBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.note);
}

/** Guarantees the ratio's own note is among the ones handed to the model.
 *
 * Similarity alone does not. On both Apple and Home Depot the gross-margin
 * note lost its top-k slot to broader sector notes, so the model sourced
 * its "typical 20-35%" benchmark from memory instead of from the knowledge
 * base — and the number guard correctly refused a figure it had never been
 * given, costing that ratio its explanation entirely. The knowledge base
 * exists so the model argues from it rather than from recall, so the
 * ratio's own note is pinned and similarity fills the remaining slots.
 *
 * The tag-matching fallback already guarantees this through its +3 exact
 * ratio bonus, which outranks any achievable tag score. */
export function pinOwnNote(
  ctx: RetrievalContext,
  ranked: KBNote[],
  all: KBNote[],
  k: number,
): KBNote[] {
  if (ranked.some((n) => n.ratio === ctx.ratioId)) return ranked;
  const own = all.find((n) => n.ratio === ctx.ratioId);
  if (!own) return ranked;
  return [own, ...ranked].slice(0, k);
}

/** Top-k knowledge base notes for every context in one embedding request,
 * instead of one request per ratio. explainCategory has up to ~11 ratios
 * to retrieve for across a report, and issuing that many requests in
 * parallel is what tripped the embedding provider's concurrency limit —
 * batching the query texts into a single call fixes that at the source
 * (lib/embed.ts's request queue is the second layer of defense, for
 * whatever concurrency batching doesn't absorb). */
export async function retrieveNotesBatch(
  contexts: RetrievalContext[],
  k = 3,
): Promise<KBNote[][]> {
  const index = loadIndex();
  if (!index || index.notes.length === 0 || contexts.length === 0) {
    return contexts.map(() => []);
  }

  try {
    // Inside the try deliberately. This assertion throws, and so does a
    // missing or invalid EMBED_* config when getEmbedConfig() runs inside
    // it. Either one used to escape this function and take explainCategory
    // down with it, so an embedding problem silently cost you every
    // explanation on the page rather than just the note lookup. Bad
    // retrieval config should cost retrieval quality, nothing more.
    assertModelMatches(index);
    const queryVectors = await embed(contexts.map(buildQueryText), "query");
    return queryVectors.map((queryVector, i) => {
      const ranked = index.notes
        .map((note) => ({ note, score: cosineSimilarity(queryVector, note.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((x) => x.note);
      return pinOwnNote(contexts[i], ranked, index.notes, k);
    });
  } catch (err) {
    console.error(
      "Semantic retrieval unavailable — falling back to tag matching. " +
        "Explanations will still generate; note selection is just weaker. Cause:",
      err,
    );
    return contexts.map((ctx) => fallbackTagMatch(ctx, index.notes, k));
  }
}
