// Tier-2 fallback (spec §20): "Gemini Semantic Engine → failure → Existing Rule/Static Semantic
// Engine → failure → Generic clarification". This is the middle tier — a small, deterministic,
// keyword-based classifier in the same style as server/src/ai/model-router.ts's `hasAny` checks,
// used ONLY when Gemini itself is unreachable/unconfigured/invalid (never as the primary path).
//
// Deliberately honest about its own limits: unlike Gemini, it cannot recognize a brand-new
// beneficiary name it has never seen (no LLM, no mock-data lookup either — see
// docs/GEMINI_AGENT_AUDIT.md §3.1 on why the *existing* 61-intent engine can't do this either).
// Missing an entity here just means `missingFields` correctly lists it and the Workflow Engine
// asks the customer directly — never a guess, never a crash.

import { ACCOUNT_NO_RE, DOCUMENT_ID_RE } from '../semantic/entity-extractor';
import { stripDiacritics } from '../semantic/normalizer';
import { AgentEntities, AgentIntent, EntityValue, REQUIRED_FIELDS_BY_INTENT, SemanticUnderstanding } from './schemas/semantic-understanding.schema';

function hasAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((p) => normalized.includes(stripDiacritics(p.toLowerCase())));
}

// Negative lookbehind excludes a digit run that's part of a token like "TX123"/"LC-2026-001" —
// only a digit run starting at a true token boundary (not preceded by a letter OR another
// digit — a naive letter-only exclusion still matched "23" out of "TX123" at the '2') counts as
// a standalone amount.
const BARE_AMOUNT_RE = /(?<![A-Za-zÀ-ỹ0-9])(\d+(?:[.,]\d+)?)\s*(tỷ|ty|triệu|trieu|nghìn|nghin|k|củ|cu)?/i;
const UNIT_MULTIPLIER: Record<string, number> = {
  ty: 1_000_000_000,
  trieu: 1_000_000,
  cu: 1_000_000,
  nghin: 1_000,
  k: 1_000,
};

function entityValue(value: string | number, confidence: number): EntityValue {
  return { value, confidence, source: 'fallback_rule_engine' };
}

function extractAmount(originalText: string): EntityValue | undefined {
  const normalized = stripDiacritics(originalText.toLowerCase());
  const match = normalized.match(BARE_AMOUNT_RE);
  if (!match) return undefined;
  const n = parseFloat(match[1].replace(',', '.'));
  if (Number.isNaN(n)) return undefined;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit ? (UNIT_MULTIPLIER[unit] ?? 1) : 1;
  return entityValue(n * multiplier, 0.6);
}

// This demo's own ledger ids (server/data/transactions.json) use a "txn-NNN" prefix, which
// DOCUMENT_ID_RE below doesn't cover (it only knows the trade-finance-style LC/BG/COL/LN/INV/PO
// prefixes) — recognized separately so "kiểm tra giao dịch txn-001" resolves a real transaction
// under fallback too, not just an id typed in the trade-finance shorthand style.
const TXN_ID_RE = /\btxn-[\w-]+\b/i;

function extractEntities(originalText: string): AgentEntities {
  const entities: AgentEntities = {};
  const docMatch = originalText.match(DOCUMENT_ID_RE) ?? originalText.match(TXN_ID_RE);
  if (docMatch) entities.transactionId = entityValue(docMatch[0].toUpperCase(), 0.8);
  const acctMatch = originalText.match(ACCOUNT_NO_RE);
  if (acctMatch) entities.accountNumber = entityValue(acctMatch[0], 0.8);
  const amount = extractAmount(originalText);
  if (amount) entities.amount = amount;
  if (stripDiacritics(originalText.toLowerCase()).includes('vnd') || /\bđồng\b/i.test(originalText)) {
    entities.currency = entityValue('VND', 0.7);
  } else if (/\busd\b/i.test(originalText)) {
    entities.currency = entityValue('USD', 0.9);
  }
  return entities;
}

interface Rule {
  intent: AgentIntent;
  phrases: string[];
}

// Order matters — first match wins, so more specific phrasing is listed before generic ones.
const RULES: Rule[] = [
  // Bare "chuyển" is intentionally broad (a syllable, not a full phrase) — "chuyển 5 triệu cho
  // X" never contains a longer literal phrase since the amount sits between "chuyển" and "cho".
  // Rare false positives (e.g. "chuyển đổi ngoại tệ") are an accepted trade-off in this
  // secondary fallback tier only used when Gemini itself is unreachable.
  { intent: 'create_transfer', phrases: ['chuyển tiền', 'chuyển khoản', 'chuyển giúp', 'thực hiện giao dịch chuyển', 'thực hiện giao dịch', 'chuyển cho', 'chuyển đến', 'chuyển'] },
  { intent: 'check_balance', phrases: ['số dư', 'còn bao nhiêu tiền', 'tài khoản của tôi còn', 'kiểm tra số dư'] },
  { intent: 'track_transaction', phrases: ['kiểm tra giao dịch', 'tra cứu giao dịch', 'trạng thái giao dịch', 'giao dịch mã'] },
  { intent: 'create_lc', phrases: ['mở lc', 'phát hành lc', 'tạo lc', 'làm lc'] },
  { intent: 'check_lc_status', phrases: ['tình trạng lc', 'trạng thái lc', 'lc nào sắp hết hạn', 'kiểm tra lc'] },
  { intent: 'create_guarantee', phrases: ['mở bảo lãnh', 'phát hành bảo lãnh', 'tạo bảo lãnh'] },
  { intent: 'check_guarantee_status', phrases: ['tình trạng bảo lãnh', 'trạng thái bảo lãnh', 'kiểm tra bảo lãnh'] },
  { intent: 'create_collection', phrases: ['mở nhờ thu', 'tạo bộ nhờ thu', 'tạo nhờ thu'] },
  { intent: 'check_collection_status', phrases: ['tình trạng nhờ thu', 'trạng thái nhờ thu', 'kiểm tra nhờ thu'] },
  { intent: 'product_information', phrases: ['sản phẩm nào phù hợp', 'thông tin sản phẩm', 'gợi ý sản phẩm', 'lãi suất'] },
  { intent: 'transaction_search', phrases: ['tìm giao dịch', 'danh sách giao dịch', 'lịch sử giao dịch'] },
  { intent: 'contact_rm', phrases: ['gặp rm', 'liên hệ rm', 'nói chuyện với nhân viên', 'liên hệ nhân viên'] },
];

/** Deterministic keyword classification — never throws, never awaits anything. */
export function classifyWithRules(message: string): SemanticUnderstanding {
  const normalized = stripDiacritics(message.toLowerCase());
  const rule = RULES.find((r) => hasAny(normalized, r.phrases));
  const entities = extractEntities(message);

  if (!rule) {
    // A question mark or a reasonably long sentence still probably means "something to look
    // up" rather than pure noise — route to the existing engine instead of a flat "unknown".
    const looksLikeAQuestion = message.trim().length > 8;
    return {
      intent: looksLikeAQuestion ? 'general_question' : 'unknown',
      confidence: looksLikeAQuestion ? 0.4 : 0.1,
      entities,
      missingFields: [],
      explanation: 'Phân loại bằng bộ quy tắc dự phòng (Gemini không khả dụng) — có thể kém chính xác hơn.',
    };
  }

  const required = REQUIRED_FIELDS_BY_INTENT[rule.intent] ?? [];
  const missingFields = required.filter((field) => !entities[field]);

  return {
    intent: rule.intent,
    confidence: 0.55,
    entities,
    missingFields,
    explanation: 'Phân loại bằng bộ quy tắc dự phòng (Gemini không khả dụng) — có thể kém chính xác hơn.',
  };
}
