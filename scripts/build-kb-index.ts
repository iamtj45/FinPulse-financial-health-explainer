/**
 * Build-time indexer for the knowledge base (§6). Reads every markdown note
 * in content/kb/, embeds its body text, and writes content/kb-index.json —
 * committed, so the deployed app never calls the embeddings API at request
 * time for anything other than the query string itself.
 *
 * Run with: npm run build-kb-index (requires EMBED_PROVIDER/EMBED_API_KEY/
 * EMBED_MODEL in .env.local).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { loadEnvForScripts } from "../lib/loadEnv";
import { currentEmbedModelId, embed } from "../lib/embed";

// lib/embed.ts reads EMBED_* from process.env lazily (inside embed() and
// currentEmbedModelId(), not at import time), so it's safe to load env vars
// here, after the import above but before those functions are called below.
loadEnvForScripts();

const KB_DIR = resolve(process.cwd(), "content/kb");
const OUT_PATH = resolve(process.cwd(), "content/kb-index.json");

interface NoteFrontmatter {
  id?: string;
  ratio?: string;
  tags?: string[];
}

interface ParsedNote {
  id: string;
  ratio: string | null;
  tags: string[];
  text: string;
}

function readNotes(): ParsedNote[] {
  const files = readdirSync(KB_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    throw new Error(`No markdown notes found in ${KB_DIR}`);
  }

  return files.map((file) => {
    const raw = readFileSync(join(KB_DIR, file), "utf-8");
    const { data, content } = matter(raw);
    const fm = data as NoteFrontmatter;

    if (!fm.id) {
      throw new Error(`${file}: frontmatter is missing required field "id"`);
    }

    const text = content.trim();
    if (!text) {
      throw new Error(`${file}: note body is empty`);
    }

    return { id: fm.id, ratio: fm.ratio ?? null, tags: fm.tags ?? [], text };
  });
}

async function main() {
  const notes = readNotes();
  const ids = new Set(notes.map((n) => n.id));
  if (ids.size !== notes.length) {
    throw new Error("Duplicate note id found in content/kb/ — ids must be unique.");
  }

  console.log(`Embedding ${notes.length} knowledge base notes...`);
  const vectors = await embed(
    notes.map((n) => n.text),
    "document",
  );

  const index = {
    model: currentEmbedModelId(),
    dim: vectors[0]?.length ?? 0,
    notes: notes.map((n, i) => ({ ...n, vector: vectors[i] })),
  };

  writeFileSync(OUT_PATH, JSON.stringify(index, null, 2));
  console.log(`Wrote ${OUT_PATH} (${index.notes.length} notes, ${index.dim} dimensions)`);
}

main().catch((err) => {
  console.error("build-kb-index failed:", err);
  process.exitCode = 1;
});
