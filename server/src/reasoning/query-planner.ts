// Phase 5.5 Query Planner (spec §7) — the single declarative source of each reasoning use
// case's plan (objective/steps/constraints), formalizing what was previously an inline
// `PLANS: Record<ReasoningUseCase, string[]>` map inside reasoning-engine.ts. reasoning-engine.ts
// now derives its own step list from here instead of keeping a second, driftable copy — see
// buildReasoningPlan() below and its one call site.
//
// AI_MAX_STEPS bounds every plan (spec §7's own "Maximum: AI_MAX_STEPS=6. Prevent infinite
// loops"): buildReasoningPlan() never truncates a plan itself, it just reports steps.length so
// the caller can refuse to execute when it exceeds config.maxSteps — exactly the check
// reasoning-engine.ts::runReasoning already performed before this file existed.

import {
  getBankGuarantees,
  getCashPosition,
  getCollectionDeadlines,
  getCollections,
  getGuaranteeDeadlines,
  getLcDeadlines,
  getLetterOfCredits,
  getLoanObligations,
  getPayables,
  getPaymentOrders,
  getPendingApprovals,
  getProducts,
  getReceivables,
  getRecommendations,
  getTasks,
  getTradeFinanceExposure,
  getTradeFinanceLimits,
  getTransactions,
} from '../tools';
import { ReasoningUseCase } from '../ai/model-router';
import { classifyComplexity, reasoningTypeOf } from './complexity-classifier';
import { ReasoningPlan } from './reasoning-types';

interface PlanDef {
  objective: string;
  steps: string[];
  requiresCalculation: boolean;
}

/** Declarative per-use-case plan definitions. `steps` lists tool names in call order — the
 * same tool name can appear twice when the use case genuinely calls it twice (e.g.
 * CASHFLOW_DIAGNOSTIC pulls the current *and* the previous period). */
const PLAN_DEFS: Record<ReasoningUseCase, PlanDef> = {
  CASHFLOW_ANALYSIS: { objective: 'Phân tích dòng tiền trong kỳ', steps: [getTransactions.name], requiresCalculation: true },
  LIQUIDITY_ANALYSIS: {
    objective: 'Đánh giá khả năng thanh khoản 30 ngày tới',
    steps: [getCashPosition.name, getPayables.name, getLoanObligations.name],
    requiresCalculation: true,
  },
  IDLE_CASH_ANALYSIS: {
    objective: 'Ước tính tiền nhàn rỗi 30 ngày tới',
    steps: [getCashPosition.name, getReceivables.name, getPayables.name],
    requiresCalculation: true,
  },
  PAYMENT_PRIORITIZATION: { objective: 'Xếp hạng ưu tiên thanh toán 30 ngày tới', steps: [getPayables.name], requiresCalculation: true },
  APPROVAL_PRIORITIZATION: { objective: 'Xếp hạng ưu tiên phê duyệt', steps: [getPendingApprovals.name], requiresCalculation: true },
  PRODUCT_RECOMMENDATION_REASONING: {
    objective: 'Gợi ý sản phẩm dựa trên dòng tiền hiện tại',
    steps: [getCashPosition.name, getReceivables.name, getPayables.name, getRecommendations.name, getProducts.name],
    requiresCalculation: true,
  },
  LC_RISK_PRIORITIZATION: { objective: 'Xếp hạng LC theo mức độ rủi ro cần xử lý', steps: [getLcDeadlines.name], requiresCalculation: true },
  GUARANTEE_RISK_PRIORITIZATION: {
    objective: 'Xếp hạng bảo lãnh theo mức độ rủi ro cần xử lý',
    steps: [getGuaranteeDeadlines.name],
    requiresCalculation: true,
  },
  TRADE_FINANCE_EXPOSURE: {
    objective: 'Tổng hợp exposure Trade Finance theo loại và theo tiền tệ',
    steps: [getTradeFinanceExposure.name],
    requiresCalculation: true,
  },
  TRADE_FINANCE_LIMIT_ANALYSIS: { objective: 'Đánh giá hạn mức Trade Finance', steps: [getTradeFinanceLimits.name], requiresCalculation: true },
  TRADE_FINANCE_OVERVIEW: {
    objective: 'Tổng quan hoạt động Trade Finance',
    steps: [getLetterOfCredits.name, getBankGuarantees.name, getCollections.name, getTradeFinanceExposure.name, getTradeFinanceLimits.name],
    requiresCalculation: true,
  },
  TRADE_FINANCE_ATTENTION: {
    objective: 'Trade Finance cần chú ý hôm nay',
    steps: [getLcDeadlines.name, getGuaranteeDeadlines.name, getCollections.name],
    requiresCalculation: true,
  },
  // ---- Phase 5.5 ---------------------------------------------------------------------------
  CASHFLOW_DIAGNOSTIC: {
    objective: 'Xác định nguyên nhân dòng tiền thay đổi so với kỳ trước',
    steps: [getTransactions.name, getTransactions.name],
    requiresCalculation: true,
  },
  // 6 of the 9 domains spec §17's worked example names (Tasks/Approvals/Payments/LC/
  // Guarantee/Collection) — Cashflow/Loans/Alerts are deliberately left out of the *tool-call*
  // plan to stay within the existing AI_MAX_STEPS=6 ceiling rather than widen it; see
  // docs/phase-5.5-evaluation.md "Known limitations".
  DAILY_PRIORITY: {
    objective: 'Xác định việc quan trọng nhất cần xử lý hôm nay trên toàn bộ nghiệp vụ',
    steps: [getTasks.name, getPendingApprovals.name, getPayables.name, getLcDeadlines.name, getGuaranteeDeadlines.name, getCollectionDeadlines.name],
    requiresCalculation: true,
  },
};

export function buildReasoningPlan(useCase: ReasoningUseCase, maxSteps: number): ReasoningPlan {
  const def = PLAN_DEFS[useCase];
  return {
    reasoningType: reasoningTypeOf(useCase),
    complexity: classifyComplexity(useCase, true),
    objective: def.objective,
    steps: def.steps,
    constraints: {
      maxSteps,
      requiresCalculation: def.requiresCalculation,
      // Verification is mandatory for MODERATE/COMPLEX per spec §14 — SIMPLE questions never
      // reach this function at all (they stay on the deterministic response-generator.ts path).
      requiresVerification: true,
    },
  };
}

/** Exposes just the tool-name list — reasoning-engine.ts's `PLANS` map is now derived from
 * this instead of keeping its own copy. */
export function planSteps(useCase: ReasoningUseCase): string[] {
  return PLAN_DEFS[useCase].steps;
}
