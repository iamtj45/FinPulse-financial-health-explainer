/**
 * Embedding client for the knowledge base's semantic retrieval (§6).
 * Kept separate from lib/llm.ts because embeddings are a different
 * provider from generation — neither Groq nor Cerebras serves them (§7).
 *
 * Jina and Cohere have genuinely different request/response shapes (unlike
 * the interchangeable OpenAI-compatible chat endpoints in lib/llm.ts), so
 * EMBED_PROVIDER switches between two small, direct implementations rather
 * than a shared SDK call.
 */

export type EmbedTask = "document" | "query";

/**
 * Caps how many embedding requests are in flight at once. Free-tier
 * embedding providers (Jina included) enforce a low per-key concurrency
 * limit — firing one request per ratio in parallel (up to ~11 at once
 * across a report's four category sections) blew straight through it and
 * surfaced as TE_CONCURRENCY_LIMIT_EXCEEDED. Excess callers queue here
 * instead of hitting the provider at the same moment.
 */
class Semaphore {
  private available: number;
  private readonly queue: (() => void)[] = [];

  constructor(limit: number) {
    this.available = limit;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.available++;
    }
  }
}

const embedConcurrency = new Semaphore(2);

interface EmbedConfig {
  provider: "jina" | "cohere";
  apiKey: string;
  model: string;
}

function getEmbedConfig(): EmbedConfig {
  const provider = (process.env.EMBED_PROVIDER ?? "").toLowerCase();
  const apiKey = process.env.EMBED_API_KEY;
  const model = process.env.EMBED_MODEL;

  if (provider !== "jina" && provider !== "cohere") {
    throw new Error(
      `EMBED_PROVIDER must be "jina" or "cohere" (got "${provider || "unset"}"). Set it in .env.local.`,
    );
  }
  if (!apiKey) throw new Error("EMBED_API_KEY is not set.");
  if (!model) throw new Error("EMBED_MODEL is not set.");

  return { provider, apiKey, model };
}

/** Identifies which model produced a set of vectors, so a mismatch between
 * build time and query time can be asserted rather than silently degrading
 * retrieval quality (§6). */
export function currentEmbedModelId(): string {
  const { provider, model } = getEmbedConfig();
  return `${provider}:${model}`;
}

export async function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const config = getEmbedConfig();
  await embedConcurrency.acquire();
  try {
    return config.provider === "jina" ? await embedJina(texts, config) : await embedCohere(texts, task, config);
  } finally {
    embedConcurrency.release();
  }
}

async function embedJina(texts: string[], config: EmbedConfig): Promise<number[][]> {
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });

  if (!res.ok) {
    throw new Error(`Jina embeddings request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embedCohere(
  texts: string[],
  task: EmbedTask,
  config: EmbedConfig,
): Promise<number[][]> {
  const res = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      texts,
      input_type: task === "document" ? "search_document" : "search_query",
      embedding_types: ["float"],
    }),
  });

  if (!res.ok) {
    throw new Error(`Cohere embeddings request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { embeddings: { float: number[][] } };
  return json.embeddings.float;
}
