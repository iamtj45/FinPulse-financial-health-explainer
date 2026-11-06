import { describe, expect, it } from "vitest";
import { buildQueryText, pinOwnNote, type KBNote, type RetrievalContext } from "../lib/retrieve";

function note(id: string, ratio: string | null, tags: string[] = []): KBNote {
  return { id, ratio, tags, text: `note ${id}`, vector: [] };
}

const ctx: RetrievalContext = {
  ratioId: "gross_margin",
  ratioLabel: "Gross margin",
  formattedValue: "33.3%",
  trend: "stable",
  category: "profitability",
  sector: "Consumer Cyclical",
};

const ALL = [
  note("gross-margin", "gross_margin"),
  note("gross-margin-sector-range", "gross_margin"),
  note("sector-retail-grocery", null, ["retail"]),
  note("comparing-across-industries", null, ["general"]),
  note("profitability-category-overview", null, ["profitability"]),
];

describe("buildQueryText", () => {
  it("folds the computed context into the query, not just the ratio name", () => {
    const q = buildQueryText(ctx);
    expect(q).toContain("gross margin");
    expect(q).toContain("33.3%");
    expect(q).toContain("stable");
    expect(q).toContain("consumer cyclical");
  });
});

/** Observed twice against a live model: broader sector notes outranked the
 * gross-margin note, so the model quoted a benchmark it was never given and
 * the number guard deleted the explanation. */
describe("pinOwnNote", () => {
  it("inserts the ratio's own note when similarity left it out", () => {
    const ranked = [ALL[2], ALL[3], ALL[4]]; // no gross_margin note
    const result = pinOwnNote(ctx, ranked, ALL, 3);
    expect(result.some((n) => n.ratio === "gross_margin")).toBe(true);
  });

  it("keeps the result at k notes", () => {
    const ranked = [ALL[2], ALL[3], ALL[4]];
    expect(pinOwnNote(ctx, ranked, ALL, 3)).toHaveLength(3);
  });

  it("changes nothing when the ratio's own note already ranked", () => {
    const ranked = [ALL[0], ALL[2], ALL[3]];
    expect(pinOwnNote(ctx, ranked, ALL, 3)).toEqual(ranked);
  });

  it("leaves the set alone when no note is bound to that ratio", () => {
    const orphan = { ...ctx, ratioId: "ratio_with_no_note" };
    const ranked = [ALL[2], ALL[3]];
    expect(pinOwnNote(orphan, ranked, ALL, 3)).toEqual(ranked);
  });
});
