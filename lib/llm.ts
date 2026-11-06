/**
 * Provider-agnostic LLM client (§7). Every provider Groq, Cerebras,
 * Mistral, OpenRouter, and DeepSeek expose an OpenAI-compatible chat
 * completions endpoint, so switching providers is a base URL change, never
 * a code change. This is the only file in the project permitted to import
 * an LLM SDK.
 */
import OpenAI from "openai";

export interface CompleteOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

function readConfig(prefix: "LLM" | "LLM_FALLBACK"): ProviderConfig | null {
  const baseURL = process.env[`${prefix}_BASE_URL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  const model = process.env[`${prefix}_MODEL`];
  if (!baseURL || !apiKey || !model) return null;
  return { baseURL, apiKey, model };
}

/** Rate-limit errors, server errors, and a model the provider no longer
 * serves should all trigger the fallback.
 *
 * That last case is why this list used to be wrong. A retired model answers
 * 404 (some providers: 400 with code "model_not_found"), neither of which
 * matched, so the fallback was skipped and the whole feature went down the
 * day Groq retired llama-3.3-70b-versatile — which is exactly the day a
 * fallback provider is for.
 *
 * Other 4xx (malformed request, bad key) would fail identically against the
 * fallback, so they are not retried. A network-level failure (no HTTP
 * response, e.g. DNS/connection refused) has no status code and is treated
 * as retryable. */
function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 404) return true;
    if (err.status === 400 && /model/i.test(err.code ?? "")) return true;
    return err.status === 429 || (err.status !== undefined && err.status >= 500);
  }
  return true;
}

async function callProvider(config: ProviderConfig, options: CompleteOptions): Promise<string> {
  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: options.prompt });

  const response = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("LLM response contained no content");
  return text;
}

/** Tries the primary provider; on a rate-limit or 5xx error, retries once
 * against the fallback provider (§7). Both speak the same OpenAI-compatible
 * API, so only configuration differs between them. */
export async function complete(options: CompleteOptions): Promise<string> {
  const primary = readConfig("LLM");
  if (!primary) {
    throw new Error("LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL must all be set.");
  }

  try {
    return await callProvider(primary, options);
  } catch (err) {
    const fallback = readConfig("LLM_FALLBACK");
    if (fallback && isRetryable(err)) {
      console.warn("Primary LLM call failed, retrying with fallback provider:", err);
      return await callProvider(fallback, options);
    }
    throw err;
  }
}
