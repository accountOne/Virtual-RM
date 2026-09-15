// Thin wrapper around @google/generative-ai (Gemini Free Tier) — the ONLY file in this codebase
// that imports the Gemini SDK directly. Every call site above this (gemini-semantic-engine.ts)
// goes through `generateStructuredResponse()`, never the SDK itself, so swapping models/providers
// later stays a one-file change — same boundary discipline as server/src/ai/ai-client.ts and
// server/src/voice/openai-voice-client.ts already use for their own providers.
//
// Security (spec §19): the API key is read once from GEMINI_API_KEY and never appears in a log
// line, error message, or thrown Error's own text — only high-level outcome (ok/timeout/quota/
// invalid) is ever logged, never the prompt or the response content (which can carry customer
// data the caller passed in).

import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_TIMEOUT_MS = 12_000;
// One retry on a transient failure (timeout/network) — "retry hợp lý", not an unbounded loop
// that could burn through a Free Tier quota on a single bad request.
const MAX_RETRIES = 1;

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GeminiRequestError';
  }
}
export class GeminiTimeoutError extends GeminiRequestError {}
export class GeminiQuotaError extends GeminiRequestError {}
export class GeminiInvalidResponseError extends GeminiRequestError {}

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || undefined;
}

function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** Gate used by every call site before attempting a real call — mirrors
 * `cloudVoiceConfigured()`/`ai-client.ts`'s own "no key -> safe fallback" shape. */
export function geminiConfigured(): boolean {
  return !!apiKey();
}

let cachedClient: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  const key = apiKey();
  if (!key) throw new GeminiRequestError('GEMINI_API_KEY not configured');
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(key);
  return cachedClient;
}

/** Test-only hook: clears the cached SDK client so a test can reconfigure env vars and reload. */
export function _resetGeminiClientForTests(): void {
  cachedClient = null;
}

function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return message.includes('quota') || message.includes('429') || message.includes('resource_exhausted') || message.includes('resource exhausted');
}

function isTimeoutError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return message.includes('timeout') || message.includes('aborted') || message.includes('deadline');
}

export interface StructuredRequestOptions {
  /** System instruction — must forbid the model from doing anything but classify/extract
   * (see prompts/semantic-system.prompt.ts). Never built by concatenating raw user text. */
  systemInstruction: string;
  /** The user's message plus any structured context (conversation history, schema description).
   * This is the only place user-supplied text enters the request. */
  prompt: string;
  timeoutMs?: number;
}

/**
 * Calls Gemini asking for a JSON-only response (`responseMimeType: 'application/json'`) and
 * returns the raw JSON text. Deliberately does NOT parse or validate the JSON itself — every
 * caller must run the result through its own Zod schema (see schemas/*.ts); this client has no
 * opinion on what shape a caller wants, so it stays reusable for more than one structured-output
 * call site.
 *
 * Throws `GeminiQuotaError` (never retried — retrying a quota error just wastes the next
 * request too), `GeminiTimeoutError` (after one retry), or the generic `GeminiRequestError` for
 * anything else. Callers are expected to catch these and fall back (spec §20) — this function
 * never returns a partial/best-effort result.
 */
export async function generateStructuredResponse(options: StructuredRequestOptions): Promise<string> {
  const { systemInstruction, prompt, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const model = client().getGenerativeModel({
    model: modelName(),
    systemInstruction,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt, { timeout: timeoutMs });
      const text = result.response.text();
      if (!text || !text.trim()) {
        throw new GeminiInvalidResponseError('Gemini returned an empty response');
      }
      return text;
    } catch (err) {
      lastError = err;
      if (isQuotaError(err)) {
        console.error('gemini.request.quota_exceeded');
        throw new GeminiQuotaError('Gemini quota exceeded', err);
      }
      if (attempt === MAX_RETRIES) break;
      console.error('gemini.request.retry', { attempt: attempt + 1 });
    }
  }

  if (isTimeoutError(lastError)) {
    console.error('gemini.request.timeout');
    throw new GeminiTimeoutError('Gemini request timed out', lastError);
  }
  console.error('gemini.request.failed', { message: lastError instanceof Error ? lastError.message : String(lastError) });
  throw new GeminiRequestError('Gemini request failed', lastError);
}
