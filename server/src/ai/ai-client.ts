import { AIConfig, AIProvider } from './types';
import { MockReasoningProvider } from './mock-reasoning-provider';

/** Reads AI_* env vars (see .env.example) — never hard-codes a provider or a secret. */
export function loadAiConfig(): AIConfig {
  return {
    provider: process.env.AI_PROVIDER || 'mock',
    model: process.env.AI_MODEL,
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    reasoningEnabled: process.env.AI_REASONING_ENABLED !== 'false',
    maxSteps: process.env.AI_MAX_STEPS ? Number(process.env.AI_MAX_STEPS) : 6,
    confidenceThreshold: process.env.AI_CONFIDENCE_THRESHOLD ? Number(process.env.AI_CONFIDENCE_THRESHOLD) : 0.65,
  };
}

let cachedProvider: AIProvider | null = null;

/**
 * Provider factory. `AI_PROVIDER` names a real provider (claude/openai/azure-openai/vng/
 * local) to plug in later; without `AI_API_KEY` configured (the case in this environment —
 * no secret is committed), this always falls back to the deterministic MockReasoningProvider
 * per spec §4 ("nếu chưa có API key: không block implementation, tạo mock reasoning
 * provider"). Swapping in a real provider means adding one more `case` here that
 * constructs a real HTTP-backed AIProvider — the Reasoning Engine and every call site are
 * already written against the AIProvider interface, not a concrete implementation.
 */
export function getAiProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;
  const config = loadAiConfig();
  if (!config.apiKey) {
    cachedProvider = new MockReasoningProvider();
    return cachedProvider;
  }
  // A real provider (config.provider === 'claude' | 'openai' | 'azure-openai' | ...) would be
  // constructed here using config.apiKey/config.baseUrl/config.model. None is implemented in
  // this pass — no API key exists in this environment to build or test one against (see
  // docs/phase-5-analysis.md #4 "Explicitly deferred") — so it still falls back to the mock
  // provider rather than throwing, keeping the demo usable either way.
  cachedProvider = new MockReasoningProvider();
  return cachedProvider;
}

/** Test-only hook: clears the cached provider so a test can reconfigure env vars and reload. */
export function _resetAiProviderForTests(): void {
  cachedProvider = null;
}
