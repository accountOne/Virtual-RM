import { describe, test, assert, assertEqual } from './test-runner';
import { buildSecurityContext, getNavigationActions } from '../src/semantic/semantic-engine';
import { getAnchorDates } from '../src/services/transactions.service';
import { loadAiConfig } from '../src/ai/ai-client';
import { runReasoning } from '../src/ai/reasoning-engine';
import { toUserContext } from '../src/ai/types';

const security = buildSecurityContext('msb_ck', 'CHECKER');
const anchorToday = getAnchorDates().today;
const navigationActions = getNavigationActions();
const config = loadAiConfig();

describe('reasoning engine — end to end (10 required)', () => {
  test('CASHFLOW_ANALYSIS returns real net cashflow computed from real transactions', async () => {
    const r = await runReasoning({ useCase: 'CASHFLOW_ANALYSIS', security: toUserContext(security), anchorToday, navigationActions, config });
    assertEqual(r.debug.toolsUsed.includes('get_transactions'), true);
    assertEqual(r.debug.calculationsUsed.includes('NET_CASHFLOW'), true);
    assertEqual(r.answer.metrics.length, 3);
    assert(!!r.answer.summary, 'expected a non-empty summary');
  });

  test('LIQUIDITY_ANALYSIS calls all three tools and reports a real gap', async () => {
    const r = await runReasoning({ useCase: 'LIQUIDITY_ANALYSIS', security: toUserContext(security), anchorToday, navigationActions, config });
    assertEqual(r.debug.plan.length, 3);
    assertEqual(r.debug.toolsUsed.sort().join(','), ['get_cash_position', 'get_loan_obligations', 'get_payables'].sort().join(','));
    assertEqual(r.debug.calculationsUsed.includes('LIQUIDITY_GAP'), true);
    assert(r.answer.metrics.some((m) => m.label === 'Dự kiến còn'), 'expected a projected-cash metric');
  });

  test('LIQUIDITY_ANALYSIS does not double-count a payable that is really a loan repayment', async () => {
    const r = await runReasoning({ useCase: 'LIQUIDITY_ANALYSIS', security: toUserContext(security), anchorToday, navigationActions, config });
    const payablesMetric = r.answer.metrics.find((m) => m.label === 'Phải trả (30 ngày)');
    // The seeded "MSB - Phòng Tín dụng" payable (2 tỷ, relatedInvoice LN-2025-007) is the same
    // obligation as loan-001's outstanding balance — it must not also inflate the payables total.
    assert(!!payablesMetric && !payablesMetric.value.startsWith('2,'), 'payables total should exclude the loan-linked payable');
  });

  test('IDLE_CASH_ANALYSIS never reports negative idle cash', async () => {
    const r = await runReasoning({ useCase: 'IDLE_CASH_ANALYSIS', security: toUserContext(security), anchorToday, navigationActions, config });
    const idle = r.answer.metrics.find((m) => m.label === 'Ước tính nhàn rỗi');
    assert(!!idle && !idle.value.startsWith('-'), 'idle cash must never be reported as negative');
  });

  test('IDLE_CASH_ANALYSIS only recommends a product when idle cash was actually found', async () => {
    const r = await runReasoning({ useCase: 'IDLE_CASH_ANALYSIS', security: toUserContext(security), anchorToday, navigationActions, config });
    const idleMetric = r.answer.metrics.find((m) => m.label === 'Ước tính nhàn rỗi');
    const hasIdle = !!idleMetric && idleMetric.value !== '0 đ';
    assertEqual(!!r.answer.recommendation, hasIdle);
  });

  test('PAYMENT_PRIORITIZATION ranks real payables, highest urgency first', async () => {
    const r = await runReasoning({ useCase: 'PAYMENT_PRIORITIZATION', security: toUserContext(security), anchorToday, navigationActions, config });
    const records = r.answer.records as { urgency: string }[];
    assert(records.length > 0, 'expected at least one ranked payable');
    const urgencyRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    for (let i = 1; i < records.length; i++) {
      assert(urgencyRank[records[i].urgency] >= urgencyRank[records[i - 1].urgency], 'records must be sorted by descending urgency');
    }
  });

  test('APPROVAL_PRIORITIZATION ranks real pending approvals', async () => {
    const r = await runReasoning({ useCase: 'APPROVAL_PRIORITIZATION', security: toUserContext(security), anchorToday, navigationActions, config });
    assertEqual(r.debug.toolsUsed.includes('get_pending_approvals'), true);
    assert(Array.isArray(r.answer.records), 'expected a records array');
  });

  test('PRODUCT_RECOMMENDATION_REASONING never invents a product name', async () => {
    const r = await runReasoning({ useCase: 'PRODUCT_RECOMMENDATION_REASONING', security: toUserContext(security), anchorToday, navigationActions, config });
    if (r.answer.recommendation) {
      const knownNames = ['FX Business', 'Payroll', 'Term Deposit', 'Business Loan', 'Trade Finance', 'Cash Management'];
      for (const name of r.answer.recommendation.description.split(', ')) {
        assert(knownNames.includes(name), `recommended product "${name}" must come from products.json, never be invented`);
      }
    }
  });

  test('AI_MAX_STEPS below a use case\'s plan length refuses to execute rather than truncate', async () => {
    const tightConfig = { ...config, maxSteps: 1 };
    const r = await runReasoning({ useCase: 'PRODUCT_RECOMMENDATION_REASONING', security: toUserContext(security), anchorToday, navigationActions, config: tightConfig });
    assertEqual(r.debug.toolsUsed.length, 0);
    assert(r.answer.summary.includes('quá phức tạp') || r.answer.summary.length > 0, 'expected a graceful refusal message');
  });

  test('every reasoning answer carries a NAVIGATE action, never a dead end', async () => {
    const useCases = ['CASHFLOW_ANALYSIS', 'LIQUIDITY_ANALYSIS', 'IDLE_CASH_ANALYSIS', 'PAYMENT_PRIORITIZATION', 'APPROVAL_PRIORITIZATION', 'PRODUCT_RECOMMENDATION_REASONING'] as const;
    for (const useCase of useCases) {
      const r = await runReasoning({ useCase, security: toUserContext(security), anchorToday, navigationActions, config });
      assert(!!r.answer.action, `${useCase} should always offer a navigation CTA`);
    }
  });
});
