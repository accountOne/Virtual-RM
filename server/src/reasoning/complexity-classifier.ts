// Phase 5.5 Complexity Classifier (spec §6). Runs *after* the Model Router has already decided
// reasoningRequired/useCase (server/src/ai/model-router.ts) — it doesn't re-decide whether to
// reason, it labels the decision already made so debug output and the verification gate (spec
// §14: verification is mandatory for MODERATE/COMPLEX, not SIMPLE) know which tier a question
// fell into. This keeps the "don't call the reasoning model for every query" rule (spec §6)
// intact: SIMPLE never touches this file's COMPLEX/MODERATE sets at all.

import { ReasoningUseCase } from '../ai/model-router';
import { QueryComplexity, ReasoningType } from './reasoning-types';

/** Cross-domain, multi-tool, ranking/diagnostic/recommendation use cases — spec §6's COMPLEX
 * examples ("Tôi nên xử lý việc gì trước hôm nay?", "Tại sao dòng tiền giảm?", "LC nào rủi ro
 * cao nhất?"). */
const COMPLEX_USE_CASES = new Set<ReasoningUseCase>([
  'PRODUCT_RECOMMENDATION_REASONING',
  'LC_RISK_PRIORITIZATION',
  'GUARANTEE_RISK_PRIORITIZATION',
  'TRADE_FINANCE_OVERVIEW',
  'TRADE_FINANCE_ATTENTION',
  'CASHFLOW_DIAGNOSTIC',
  'DAILY_PRIORITY',
]);

/** Single-domain, few-tool, one-calculation use cases — spec §6's MODERATE examples
 * ("Tổng LC hiện tại bao nhiêu?", "Bảo lãnh nào sắp hết hạn?"). Everything reasoningRequired
 * that isn't in COMPLEX_USE_CASES falls here by default. */
export function classifyComplexity(useCase: ReasoningUseCase | undefined, reasoningRequired: boolean): QueryComplexity {
  if (!reasoningRequired || !useCase) return 'SIMPLE';
  return COMPLEX_USE_CASES.has(useCase) ? 'COMPLEX' : 'MODERATE';
}

/** How the use case answers the question (spec §5) — orthogonal to complexity: a LOOKUP is
 * always SIMPLE, but a DIAGNOSTIC or ADVISORY is always COMPLEX in this catalogue (both require
 * multi-period/multi-domain data before a claim can be made). */
const REASONING_TYPE: Record<ReasoningUseCase, ReasoningType> = {
  CASHFLOW_ANALYSIS: 'AGGREGATION',
  LIQUIDITY_ANALYSIS: 'ADVISORY',
  IDLE_CASH_ANALYSIS: 'ADVISORY',
  PAYMENT_PRIORITIZATION: 'AGGREGATION',
  APPROVAL_PRIORITIZATION: 'AGGREGATION',
  PRODUCT_RECOMMENDATION_REASONING: 'ADVISORY',
  LC_RISK_PRIORITIZATION: 'COMPARISON',
  GUARANTEE_RISK_PRIORITIZATION: 'COMPARISON',
  TRADE_FINANCE_EXPOSURE: 'AGGREGATION',
  TRADE_FINANCE_LIMIT_ANALYSIS: 'AGGREGATION',
  TRADE_FINANCE_OVERVIEW: 'AGGREGATION',
  TRADE_FINANCE_ATTENTION: 'COMPARISON',
  CASHFLOW_DIAGNOSTIC: 'DIAGNOSTIC',
  DAILY_PRIORITY: 'ADVISORY',
};

export function reasoningTypeOf(useCase: ReasoningUseCase): ReasoningType {
  return REASONING_TYPE[useCase];
}
