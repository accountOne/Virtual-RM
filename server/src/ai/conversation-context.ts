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

// ---- Trade Finance (Phase 6) — bare document-number follow-up (spec §45) --------------------

// Includes the Reasoning Engine's own LC/Guarantee-listing use cases (LC_RISK_PRIORITIZATION,
// TRADE_FINANCE_ATTENTION, ...) alongside the deterministic list-family intents — a risk-
// ranked list of LC numbers invites exactly the same "tell me more about that one" follow-up
// as a plain LC_LIST answer does (found by actually running the demo flow, see
// docs/phase-6-demo-script.md).
const LC_FOLLOWUP_INTENTS = new Set([
  'LC_LIST', 'LC_STATUS', 'LC_EXPIRY', 'LC_DETAIL', 'LC_DOCUMENT_STATUS', 'LC_DISCREPANCY', 'LC_AMENDMENT',
  'LC_RISK_PRIORITIZATION', 'TRADE_FINANCE_ATTENTION', 'TRADE_FINANCE_OVERVIEW',
]);
const GUARANTEE_FOLLOWUP_INTENTS = new Set([
  'GUARANTEE_LIST', 'GUARANTEE_EXPIRY', 'GUARANTEE_CLAIM', 'GUARANTEE_EXTENSION',
  'GUARANTEE_RISK_PRIORITIZATION', 'TRADE_FINANCE_ATTENTION', 'TRADE_FINANCE_OVERVIEW',
]);

const LC_NUMBER_RE = /\bLC-\d{4}-\d{3,}\b/i;
const BG_NUMBER_RE = /\bBG-\d{4}-\d{3,}\b/i;

export interface DocumentFollowUpResolution {
  intent: string;
  documentId: string;
}

/**
 * Detects a bare LC/BG number mentioned right after an LC/Guarantee-list-family answer
 * ("LC-2026-001", "còn BG-2026-013 thì sao?") and resolves it straight to that record's
 * detail — spec §45's own multi-turn example, extended to Trade Finance. Narrow like the
 * currency follow-up above: only fires when the previous turn was already about LCs (resp.
 * guarantees) and the new message is short, so a long, fully-formed new question is left to
 * the normal semantic engine.
 */
export function resolveDocumentFollowUp(rawMessage: string, userId: string): DocumentFollowUpResolution | undefined {
  const previous = getConversationContext(userId);
  if (!previous) return undefined;

  const wordCount = rawMessage.trim().split(/\s+/).length;
  if (wordCount > 6) return undefined;

  const lcMatch = rawMessage.match(LC_NUMBER_RE);
  if (lcMatch && LC_FOLLOWUP_INTENTS.has(previous.lastIntent)) {
    return { intent: 'LC_DETAIL', documentId: lcMatch[0].toUpperCase() };
  }

  // No dedicated GUARANTEE_DETAIL intent exists (see docs/phase-6-trade-finance-architecture.md
  // §4's scope) — GUARANTEE_LIST itself narrows to one record when a documentId is present
  // (response-generator.ts), the same "narrow when docId given, else list" shape already used
  // by LC_DISCREPANCY/LC_AMENDMENT/GUARANTEE_CLAIM.
  const bgMatch = rawMessage.match(BG_NUMBER_RE);
  if (bgMatch && GUARANTEE_FOLLOWUP_INTENTS.has(previous.lastIntent)) {
    return { intent: 'GUARANTEE_LIST', documentId: bgMatch[0].toUpperCase() };
  }

  return undefined;
}
