import { stripDiacritics } from '../semantic/normalizer';
import { AIConfig } from './types';

export type ReasoningUseCase =
  | 'CASHFLOW_ANALYSIS'
  | 'LIQUIDITY_ANALYSIS'
  | 'IDLE_CASH_ANALYSIS'
  | 'PAYMENT_PRIORITIZATION'
  | 'APPROVAL_PRIORITIZATION'
  | 'PRODUCT_RECOMMENDATION_REASONING'
  | 'LC_RISK_PRIORITIZATION'
  | 'GUARANTEE_RISK_PRIORITIZATION'
  | 'TRADE_FINANCE_EXPOSURE'
  | 'TRADE_FINANCE_LIMIT_ANALYSIS'
  | 'TRADE_FINANCE_OVERVIEW'
  | 'TRADE_FINANCE_ATTENTION'
  | 'CASHFLOW_DIAGNOSTIC'
  | 'DAILY_PRIORITY';

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

  // ---- Rule 1b: Trade Finance (Phase 6) — also no dedicated intent, pure keyword trigger --
  // Distinct from the existing single-lookup intents (LC_EXPIRY, GUARANTEE_EXPIRY, ...): these
  // are the cross-domain/analytical questions docs/phase-6-trade-finance-architecture.md §4
  // calls out — risk *prioritization* (deadline + documents + discrepancy + amount combined),
  // not just "which LC expires soonest". Phrases require "lc"/"bảo lãnh" plus a risk word, or
  // an explicit "trade finance" mention, so none of these shadow the plain lookup intents.
  if (
    hasAny(normalized, [
      'lc nào rủi ro', 'lc nào có rủi ro', 'rủi ro lc', 'lc rủi ro cao nhất', 'lc nào rủi ro cao nhất',
      'lc nào cần chú ý', 'lc nào đáng lo ngại', 'ưu tiên xử lý lc',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'LC_RISK_PRIORITIZATION' };
  }
  if (
    hasAny(normalized, [
      'bảo lãnh nào rủi ro', 'bảo lãnh nào có rủi ro', 'rủi ro bảo lãnh', 'bảo lãnh rủi ro cao nhất', 'bảo lãnh nào rủi ro cao nhất',
      'bảo lãnh nào cần chú ý', 'bảo lãnh nào đáng lo ngại', 'ưu tiên xử lý bảo lãnh',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'GUARANTEE_RISK_PRIORITIZATION' };
  }
  if (
    hasAny(normalized, [
      'tổng exposure trade finance', 'exposure trade finance', 'tổng dư nợ trade finance', 'exposure lc và bảo lãnh', 'tổng exposure lc bảo lãnh',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'TRADE_FINANCE_EXPOSURE' };
  }
  if (hasAny(normalized, ['hạn mức trade finance', 'hạn mức lc và bảo lãnh', 'còn bao nhiêu hạn mức trade finance'])) {
    return { reasoningRequired: true, useCase: 'TRADE_FINANCE_LIMIT_ANALYSIS' };
  }
  if (hasAny(normalized, ['tổng quan trade finance', 'tình hình trade finance'])) {
    return { reasoningRequired: true, useCase: 'TRADE_FINANCE_OVERVIEW' };
  }
  if (hasAny(normalized, ['trade finance cần chú ý', 'trade finance hôm nay có gì', 'việc trade finance cần làm', 'trade finance cần xử lý gì'])) {
    return { reasoningRequired: true, useCase: 'TRADE_FINANCE_ATTENTION' };
  }

  // ---- Rule 1c: Phase 5.5 — DIAGNOSTIC and cross-domain ADVISORY, no dedicated intent -----
  if (
    hasAny(normalized, [
      'tại sao dòng tiền', 'vì sao dòng tiền', 'tại sao dòng tiền giảm', 'tại sao dòng tiền tăng',
      'nguyên nhân dòng tiền', 'lý do dòng tiền',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'CASHFLOW_DIAGNOSTIC' };
  }
  if (
    hasAny(normalized, [
      'việc gì quan trọng nhất hôm nay', 'việc quan trọng nhất hôm nay', 'nên xử lý việc gì', 'nên xử lý gì hôm nay',
      'ưu tiên hôm nay', 'ưu tiên xử lý hôm nay', 'việc cần làm quan trọng nhất', 'việc gì cần làm trước',
    ])
  ) {
    return { reasoningRequired: true, useCase: 'DAILY_PRIORITY' };
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
