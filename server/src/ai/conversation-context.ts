// Multi-turn context — Phase 5 §17. This demo's API is intentionally stateless per request
// (see semantic-engine.ts::buildSecurityContext's own comment: "There's no server-side
// session in this demo"), so this is a minimal, explicitly-scoped exception: an in-memory
// map of the *last resolved intent* per userId, just enough to resolve the spec's own
// follow-up example ("Tài khoản nào nhiều tiền nhất?" → "Còn tài khoản USD?"). It holds no
// message text and no sensitive data, only an intent id and a currency code, and is wiped on
// server restart — there is no persistence layer here to leak from.

const CURRENCY_CODES = ['USD', 'EUR', 'VND', 'JPY', 'GBP', 'CNY'];

export interface ConversationState {
  lastIntent: string;
  lastCurrency?: string;
  updatedAt: number;
}

const store = new Map<string, ConversationState>();

export function getConversationContext(userId: string): ConversationState | undefined {
  return store.get(userId);
}

export function setConversationContext(userId: string, state: Omit<ConversationState, 'updatedAt'>): void {
  store.set(userId, { ...state, updatedAt: Date.now() });
}

export function _resetConversationContextForTests(): void {
  store.clear();
}

const CURRENCY_FOLLOWUP_INTENTS = new Set(['ACCOUNT_BALANCE', 'ACCOUNT_HIGHEST_BALANCE', 'ACCOUNT_LOWEST_BALANCE', 'ACCOUNT_AVAILABLE_BALANCE']);

export interface FollowUpResolution {
  intent: string;
  currency: string;
}

/**
 * Detects a short, currency-only follow-up ("Còn tài khoản USD?", "USD thì sao?") after an
 * account-balance-family question, and replays the *previous* intent with the new currency.
 * Deliberately narrow: only fires when the previous turn was one of the four balance intents
 * and the new message is short (a handful of words) — a long, fully-formed new question is
 * left to the normal semantic engine, not hijacked by stale context.
 */
export function resolveCurrencyFollowUp(rawMessage: string, userId: string): FollowUpResolution | undefined {
  const previous = getConversationContext(userId);
  if (!previous || !CURRENCY_FOLLOWUP_INTENTS.has(previous.lastIntent)) return undefined;

  const wordCount = rawMessage.trim().split(/\s+/).length;
  if (wordCount > 6) return undefined;

  const upper = rawMessage.toUpperCase();
  const currency = CURRENCY_CODES.find((c) => upper.includes(c));
  if (!currency) return undefined;

  return { intent: previous.lastIntent, currency };
}
