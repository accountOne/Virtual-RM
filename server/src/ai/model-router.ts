import { stripDiacritics } from '../semantic/normalizer';
import { AIConfig } from './types';

export type ReasoningUseCase =
  | 'CASHFLOW_ANALYSIS'
  | 'LIQUIDITY_ANALYSIS'
  | 'IDLE_CASH_ANALYSIS'
  | 'PAYMENT_PRIORITIZATION'
  | 'APPROVAL_PRIORITIZATION'
  | 'PRODUCT_RECOMMENDATION_REASONING';

export interface RoutingDecision {
  reasoningRequired: boolean;
  useCase?: ReasoningUseCase;
}

function hasAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((p) => normalized.includes(stripDiacritics(p.toLowerCase())));
}

/**
 * Deterministic rules, evaluated *before* any model call (spec §6 — "Router phải có
 * deterministic rules trước khi gọi model. Không gọi LLM cho mọi query"). Two kinds of
 * rule, checked in order:
 *
 * 1. Keyword triggers for questions the 50-intent Semantic Engine has no dedicated intent
 *    for at all (liquidity/obligation check, payment/approval prioritization) — these are
 *    genuinely cross-domain and were never in the original 50-intent spec.
 * 2. A resolved semantic intent that's ambiguous between "just show me the number"
 *    (existing deterministic handler is enough) and "analyze/project" (needs the
 *    Reasoning Engine) — disambiguated by a narrower keyword check on top of the intent
 *    the Semantic Engine already resolved, reusing its classification rather than
 *    re-deriving it.
 *
 * Everything else — the ~46 other intents already covered by response-generator.ts, plus
 * CLARIFICATION_NEEDED — stays on the existing deterministic path unchanged.
 */
export function routeQuery(rawMessage: string, resolvedIntent: string | undefined, config: AIConfig): RoutingDecision {
  if (!config.reasoningEnabled) return { reasoningRequired: false };

  const normalized = stripDiacritics(rawMessage.toLowerCase());

  // ---- Rule 1: no existing intent covers these — pure keyword trigger --------------------
  if (
    hasAny(normalized, [
      'đủ tiền trả', 'đủ khả năng', 'du tien tra', 'khả năng thanh khoản', 'khả năng đáp ứng',
      'nghĩa vụ sắp tới', 'nghĩa vụ 30 ngày', 'đủ để trả khoản vay', 'có đủ tiền',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'LIQUIDITY_ANALYSIS' };
  }
  if (hasAny(normalized, ['ưu tiên thanh toán', 'nên thanh toán khoản nào', 'nên ưu tiên thanh toán', 'thanh toán khoản nào trước'])) {
    return { reasoningRequired: true, useCase: 'PAYMENT_PRIORITIZATION' };
  }
  if (
    hasAny(normalized, [
      'nên duyệt giao dịch nào', 'duyệt cái nào trước', 'duyệt giao dịch nào trước',
      'nên phê duyệt', 'giao dịch nào nên duyệt trước',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'APPROVAL_PRIORITIZATION' };
  }
  // "tiền nhàn rỗi" (idle cash) is an unambiguous, strong signal on its own — checked here as
  // an unconditional keyword trigger, NOT gated behind resolvedIntent === 'CASH_POSITION' like
  // it originally was: stripDiacritics collapses "nhàn" (idle) and "nhận" (receive) to the
  // same ASCII "nhan" (see docs/semantic-engine.md #Known limitations), so a phrase like "tiền
  // nhàn rỗi" can accidentally substring-match "tiền nhận" and mis-resolve the 50-intent
  // engine to INCOMING_PAYMENT instead of CASH_POSITION — gating on the (already-wrong)
  // resolved intent would silently drop the reasoning trigger too. The keyword itself is
  // specific enough ("nhàn rỗi"/"rảnh rỗi" as a 2-word phrase) not to need that gate.
  if (hasAny(normalized, ['nhàn rỗi', 'rảnh rỗi', 'chưa dùng đến'])) {
    return { reasoningRequired: true, useCase: 'IDLE_CASH_ANALYSIS' };
  }

  // ---- Rule 2: existing intent, refine simple vs. reasoning by keyword -------------------
  if (resolvedIntent === 'CASH_FLOW_SUMMARY' || resolvedIntent === 'CASH_FLOW_COMPARE') {
    return { reasoningRequired: true, useCase: 'CASHFLOW_ANALYSIS' };
  }
  if (resolvedIntent === 'PRODUCT_RECOMMEND') {
    if (hasAny(normalized, ['dòng tiền', 'nhàn rỗi', 'thanh khoản', 'cash flow'])) {
      return { reasoningRequired: true, useCase: 'PRODUCT_RECOMMENDATION_REASONING' };
    }
    return { reasoningRequired: false };
  }

  // §17's third multi-turn example: "Có nên chuyển bớt sang tiền gửi không?" after an account
  // balance follow-up — self-descriptive enough to route without needing conversation context.
  if (hasAny(normalized, ['chuyển bớt sang tiền gửi', 'có nên chuyển', 'nên gửi tiết kiệm', 'có nên gửi'])) {
    return { reasoningRequired: true, useCase: 'PRODUCT_RECOMMENDATION_REASONING' };
  }

  return { reasoningRequired: false };
}
