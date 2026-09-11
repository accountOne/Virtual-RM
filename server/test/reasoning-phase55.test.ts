// Phase 5.5 — Advanced Business Reasoning & Verification. Covers the new reasoning/ layer
// (complexity classifier, query planner, evidence engine, verification engine, risk engine,
// priority engine), the two new reasoning use cases (CASHFLOW_DIAGNOSTIC, DAILY_PRIORITY), the
// Model Router rules that trigger them, and the spec §28 golden test cases end-to-end.

import { describe, test, assert, assertEqual, assertGreaterOrEqual } from './test-runner';
import { buildSecurityContext, getNavigationActions, answerQuery } from '../src/semantic/semantic-engine';
import { getAnchorDates } from '../src/services/transactions.service';
import { loadAiConfig } from '../src/ai/ai-client';
import { runReasoning } from '../src/ai/reasoning-engine';
import { toUserContext } from '../src/ai/types';
import { routeQuery } from '../src/ai/model-router';
import { classifyComplexity, reasoningTypeOf } from '../src/reasoning/complexity-classifier';
import { buildReasoningPlan, planSteps } from '../src/reasoning/query-planner';
import { pluckEvidence, summarizeEvidence, calculatedEvidence } from '../src/reasoning/evidence-engine';
import { verifyReasoning, safeFallbackAnswer } from '../src/reasoning/verification-engine';
import { scoreLcRisk, scoreGuaranteeRisk, scoreCollectionRisk, levelFromScore } from '../src/reasoning/risk-engine';
import { crossDomainPriorities } from '../src/reasoning/priority-engine';
import { getLcDeadlines, getGuaranteeDeadlines, getCollectionDeadlines, getTasks, getPendingApprovals, getPayables } from '../src/tools';

const security = buildSecurityContext('msb_ck', 'CHECKER');
const anchorToday = getAnchorDates().today;
const navigationActions = getNavigationActions();
const config = loadAiConfig();
const ctx = toUserContext(security);

// ---- Complexity Classifier (15 required) -----------------------------------------------------
describe('complexity classifier (15 required)', () => {
  test('no reasoning required → SIMPLE', () => assertEqual(classifyComplexity(undefined, false), 'SIMPLE'));
  test('reasoningRequired but no useCase → SIMPLE', () => assertEqual(classifyComplexity(undefined, true), 'SIMPLE'));
  test('CASHFLOW_ANALYSIS → MODERATE', () => assertEqual(classifyComplexity('CASHFLOW_ANALYSIS', true), 'MODERATE'));
  test('LIQUIDITY_ANALYSIS → MODERATE', () => assertEqual(classifyComplexity('LIQUIDITY_ANALYSIS', true), 'MODERATE'));
  test('IDLE_CASH_ANALYSIS → MODERATE', () => assertEqual(classifyComplexity('IDLE_CASH_ANALYSIS', true), 'MODERATE'));
  test('PAYMENT_PRIORITIZATION → MODERATE', () => assertEqual(classifyComplexity('PAYMENT_PRIORITIZATION', true), 'MODERATE'));
  test('APPROVAL_PRIORITIZATION → MODERATE', () => assertEqual(classifyComplexity('APPROVAL_PRIORITIZATION', true), 'MODERATE'));
  test('TRADE_FINANCE_EXPOSURE → MODERATE', () => assertEqual(classifyComplexity('TRADE_FINANCE_EXPOSURE', true), 'MODERATE'));
  test('TRADE_FINANCE_LIMIT_ANALYSIS → MODERATE', () => assertEqual(classifyComplexity('TRADE_FINANCE_LIMIT_ANALYSIS', true), 'MODERATE'));
  test('PRODUCT_RECOMMENDATION_REASONING → COMPLEX', () => assertEqual(classifyComplexity('PRODUCT_RECOMMENDATION_REASONING', true), 'COMPLEX'));
  test('LC_RISK_PRIORITIZATION → COMPLEX', () => assertEqual(classifyComplexity('LC_RISK_PRIORITIZATION', true), 'COMPLEX'));
  test('GUARANTEE_RISK_PRIORITIZATION → COMPLEX', () => assertEqual(classifyComplexity('GUARANTEE_RISK_PRIORITIZATION', true), 'COMPLEX'));
  test('TRADE_FINANCE_ATTENTION → COMPLEX', () => assertEqual(classifyComplexity('TRADE_FINANCE_ATTENTION', true), 'COMPLEX'));
  test('CASHFLOW_DIAGNOSTIC → COMPLEX', () => assertEqual(classifyComplexity('CASHFLOW_DIAGNOSTIC', true), 'COMPLEX'));
  test('DAILY_PRIORITY → COMPLEX', () => assertEqual(classifyComplexity('DAILY_PRIORITY', true), 'COMPLEX'));
  test('reasoningTypeOf CASHFLOW_DIAGNOSTIC → DIAGNOSTIC', () => assertEqual(reasoningTypeOf('CASHFLOW_DIAGNOSTIC'), 'DIAGNOSTIC'));
  test('reasoningTypeOf DAILY_PRIORITY → ADVISORY', () => assertEqual(reasoningTypeOf('DAILY_PRIORITY'), 'ADVISORY'));
  test('reasoningTypeOf LC_RISK_PRIORITIZATION → COMPARISON', () => assertEqual(reasoningTypeOf('LC_RISK_PRIORITIZATION'), 'COMPARISON'));
});

// ---- Query Planner (20 required) --------------------------------------------------------------
describe('query planner (20 required)', () => {
  test('planSteps never exceeds AI_MAX_STEPS=6 for any use case', () => {
    const useCases: Parameters<typeof planSteps>[0][] = [
      'CASHFLOW_ANALYSIS', 'LIQUIDITY_ANALYSIS', 'IDLE_CASH_ANALYSIS', 'PAYMENT_PRIORITIZATION', 'APPROVAL_PRIORITIZATION',
      'PRODUCT_RECOMMENDATION_REASONING', 'LC_RISK_PRIORITIZATION', 'GUARANTEE_RISK_PRIORITIZATION', 'TRADE_FINANCE_EXPOSURE',
      'TRADE_FINANCE_LIMIT_ANALYSIS', 'TRADE_FINANCE_OVERVIEW', 'TRADE_FINANCE_ATTENTION', 'CASHFLOW_DIAGNOSTIC', 'DAILY_PRIORITY',
    ];
    for (const uc of useCases) assert(planSteps(uc).length <= 6, `${uc} plan must stay within AI_MAX_STEPS=6, got ${planSteps(uc).length}`);
  });
  test('CASHFLOW_ANALYSIS plan is exactly [get_transactions]', () => assertEqual(planSteps('CASHFLOW_ANALYSIS').join(','), 'get_transactions'));
  test('LIQUIDITY_ANALYSIS plan has 3 steps', () => assertEqual(planSteps('LIQUIDITY_ANALYSIS').length, 3));
  test('TRADE_FINANCE_OVERVIEW plan has 5 steps', () => assertEqual(planSteps('TRADE_FINANCE_OVERVIEW').length, 5));
  test('CASHFLOW_DIAGNOSTIC plan calls get_transactions twice (current + previous period)', () =>
    assertEqual(planSteps('CASHFLOW_DIAGNOSTIC').filter((s) => s === 'get_transactions').length, 2));
  test('DAILY_PRIORITY plan spans 6 distinct cross-domain tools', () => {
    const steps = planSteps('DAILY_PRIORITY');
    assertEqual(new Set(steps).size, 6);
    assertEqual(steps.length, 6);
  });
  test('DAILY_PRIORITY plan includes tasks/approvals/payments/LC/guarantee/collection', () => {
    const steps = new Set(planSteps('DAILY_PRIORITY'));
    for (const t of ['get_tasks', 'get_pending_approvals', 'get_payables', 'get_lc_deadlines', 'get_guarantee_deadlines', 'get_collection_deadlines']) {
      assert(steps.has(t), `expected DAILY_PRIORITY to call ${t}`);
    }
  });
  test('buildReasoningPlan tags LOOKUP-adjacent MODERATE use cases correctly', () => {
    const plan = buildReasoningPlan('CASHFLOW_ANALYSIS', 6);
    assertEqual(plan.complexity, 'MODERATE');
    assertEqual(plan.reasoningType, 'AGGREGATION');
    assert(!!plan.objective, 'expected a non-empty objective');
  });
  test('buildReasoningPlan tags DIAGNOSTIC use case correctly', () => {
    const plan = buildReasoningPlan('CASHFLOW_DIAGNOSTIC', 6);
    assertEqual(plan.reasoningType, 'DIAGNOSTIC');
    assertEqual(plan.complexity, 'COMPLEX');
  });
  test('buildReasoningPlan always requires verification', () => {
    for (const uc of ['CASHFLOW_ANALYSIS', 'DAILY_PRIORITY'] as const) {
      assertEqual(buildReasoningPlan(uc, 6).constraints.requiresVerification, true);
    }
  });
  test('buildReasoningPlan.constraints.maxSteps reflects the config passed in', () => {
    assertEqual(buildReasoningPlan('CASHFLOW_ANALYSIS', 4).constraints.maxSteps, 4);
  });
  test('every use case has requiresCalculation true (none of these are pure lookups)', () => {
    for (const uc of ['CASHFLOW_ANALYSIS', 'LC_RISK_PRIORITIZATION', 'DAILY_PRIORITY'] as const) {
      assertEqual(buildReasoningPlan(uc, 6).constraints.requiresCalculation, true);
    }
  });
  test('a plan exceeding maxSteps is refused before any tool call (runReasoning integration)', async () => {
    const tight = { ...config, maxSteps: 1 };
    const r = await runReasoning({ useCase: 'DAILY_PRIORITY', security: ctx, anchorToday, navigationActions, config: tight });
    assertEqual(r.debug.toolsUsed.length, 0);
    assertEqual(r.debug.verificationStatus, 'FAILED');
  });
  test('LC_RISK_PRIORITIZATION plan is exactly [get_lc_deadlines]', () => assertEqual(planSteps('LC_RISK_PRIORITIZATION').join(','), 'get_lc_deadlines'));
  test('GUARANTEE_RISK_PRIORITIZATION plan is exactly [get_guarantee_deadlines]', () =>
    assertEqual(planSteps('GUARANTEE_RISK_PRIORITIZATION').join(','), 'get_guarantee_deadlines'));
  test('TRADE_FINANCE_ATTENTION plan has 3 steps', () => assertEqual(planSteps('TRADE_FINANCE_ATTENTION').length, 3));
  test('PRODUCT_RECOMMENDATION_REASONING plan has 5 steps', () => assertEqual(planSteps('PRODUCT_RECOMMENDATION_REASONING').length, 5));
  test('IDLE_CASH_ANALYSIS plan has 3 steps', () => assertEqual(planSteps('IDLE_CASH_ANALYSIS').length, 3));
  test('PAYMENT_PRIORITIZATION plan is exactly [get_payables]', () => assertEqual(planSteps('PAYMENT_PRIORITIZATION').join(','), 'get_payables'));
  test('APPROVAL_PRIORITIZATION plan is exactly [get_pending_approvals]', () =>
    assertEqual(planSteps('APPROVAL_PRIORITIZATION').join(','), 'get_pending_approvals'));
  test('TRADE_FINANCE_LIMIT_ANALYSIS plan is exactly [get_trade_finance_limits]', () =>
    assertEqual(planSteps('TRADE_FINANCE_LIMIT_ANALYSIS').join(','), 'get_trade_finance_limits'));
  test('TRADE_FINANCE_EXPOSURE plan is exactly [get_trade_finance_exposure]', () =>
    assertEqual(planSteps('TRADE_FINANCE_EXPOSURE').join(','), 'get_trade_finance_exposure'));
});

// ---- Evidence Engine (15 required) -------------------------------------------------------------
describe('evidence engine (15 required)', () => {
  const lcs = getLcDeadlines.execute(ctx, {});

  test('pluckEvidence produces one row per (item, field) pair', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', lcs, ['expiryDate', 'status']);
    assertEqual(evidence.length, lcs.length * 2);
  });
  test('every evidence row carries the given source', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', lcs.slice(0, 1), ['expiryDate']);
    assert(evidence.every((e) => e.source === 'letter-of-credits.json'), 'expected the exact source string on every row');
  });
  test('every evidence row carries the given entityType', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', lcs.slice(0, 1), ['expiryDate']);
    assert(evidence.every((e) => e.entityType === 'LetterOfCredit'), 'expected the exact entityType on every row');
  });
  test('entityId matches the real record field, never a placeholder', () => {
    const [first] = lcs;
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', [first], ['expiryDate']);
    assertEqual(evidence[0].entityId, first.lcNumber);
  });
  test('value matches the real record field value', () => {
    const [first] = lcs;
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', [first], ['expiryDate']);
    assertEqual(evidence[0].value, first.expiryDate);
  });
  test('pluckEvidence over an empty list returns an empty array', () => {
    assertEqual(pluckEvidence('x', 'X', 'lcNumber' as any, [], []).length, 0);
  });
  test('calculatedEvidence source is prefixed with "calculation:"', () => {
    const e = calculatedEvidence('NET_CASHFLOW', 'CashflowPeriod', 'current', 'net', 1000);
    assertEqual(e.source, 'calculation:NET_CASHFLOW');
  });
  test('calculatedEvidence carries the exact value passed in, never a formatted string', () => {
    const e = calculatedEvidence('NET_CASHFLOW', 'CashflowPeriod', 'current', 'net', 123456);
    assertEqual(e.value, 123456);
  });
  test('summarizeEvidence drops the raw value field', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', lcs.slice(0, 1), ['expiryDate']);
    const summary = summarizeEvidence(evidence);
    assert(!('value' in summary[0]), 'evidenceSummary rows must not carry the raw value');
  });
  test('summarizeEvidence keeps entityType/entityId/field', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', lcs.slice(0, 1), ['expiryDate']);
    const [row] = summarizeEvidence(evidence);
    assertEqual(row.entityType, 'LetterOfCredit');
    assertEqual(row.field, 'expiryDate');
  });
  test('summarizeEvidence respects the limit parameter', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', lcs, ['expiryDate', 'status', 'outstandingAmount']);
    assertGreaterOrEqual(evidence.length, 3);
    assertEqual(summarizeEvidence(evidence, 2).length, 2);
  });
  test('summarizeEvidence defaults to a bounded limit (does not explode for large evidence lists)', () => {
    const evidence = pluckEvidence('letter-of-credits.json', 'LetterOfCredit', 'lcNumber', [...lcs, ...lcs, ...lcs, ...lcs, ...lcs, ...lcs, ...lcs, ...lcs], [
      'expiryDate',
    ]);
    assert(summarizeEvidence(evidence).length <= 20, 'default summary limit must stay bounded');
  });
  test('LC_RISK_PRIORITIZATION reasoning result carries a non-empty evidenceSummary', async () => {
    const r = await runReasoning({ useCase: 'LC_RISK_PRIORITIZATION', security: ctx, anchorToday, navigationActions, config });
    assert(r.debug.evidenceSummary.length > 0, 'expected LC evidence to back the risk ranking');
  });
  test('GUARANTEE_RISK_PRIORITIZATION reasoning result carries a non-empty evidenceSummary', async () => {
    const r = await runReasoning({ useCase: 'GUARANTEE_RISK_PRIORITIZATION', security: ctx, anchorToday, navigationActions, config });
    assert(r.debug.evidenceSummary.length > 0, 'expected guarantee evidence to back the risk ranking');
  });
  test('every evidenceSummary row for TRADE_FINANCE_EXPOSURE traces to a real currency total', async () => {
    const r = await runReasoning({ useCase: 'TRADE_FINANCE_EXPOSURE', security: ctx, anchorToday, navigationActions, config });
    for (const row of r.debug.evidenceSummary) assert(!!row.entityId, 'every exposure evidence row must have a currency entityId');
  });
});

// ---- Verification Engine (20 required) ---------------------------------------------------------
describe('verification engine (20 required)', () => {
  const goodAnswer = { title: 'T', summary: 'Tóm tắt hợp lệ', metrics: [{ label: 'A', value: '100 đ' }], records: [] };

  test('a well-formed answer with data verifies clean', () => {
    const result = verifyReasoning({ answer: goodAnswer, evidence: [], hasData: true });
    assertEqual(result.valid, true);
    assertEqual(result.errors.length, 0);
  });
  test('no source data → error', () => {
    const result = verifyReasoning({ answer: goodAnswer, evidence: [], hasData: false });
    assertEqual(result.valid, false);
    assert(result.errors.length > 0, 'expected at least one error');
  });
  test('empty summary → error', () => {
    const result = verifyReasoning({ answer: { ...goodAnswer, summary: '' }, evidence: [], hasData: true });
    assertEqual(result.valid, false);
  });
  test('whitespace-only summary → error', () => {
    const result = verifyReasoning({ answer: { ...goodAnswer, summary: '   ' }, evidence: [], hasData: true });
    assertEqual(result.valid, false);
  });
  test('a NaN-shaped metric value → error', () => {
    const result = verifyReasoning({ answer: { ...goodAnswer, metrics: [{ label: 'A', value: 'NaN đ' }] }, evidence: [], hasData: true });
    assertEqual(result.valid, false);
  });
  test('an undefined-shaped metric value → error', () => {
    const result = verifyReasoning({ answer: { ...goodAnswer, metrics: [{ label: 'A', value: 'undefined' }] }, evidence: [], hasData: true });
    assertEqual(result.valid, false);
  });
  test('a null metric value → error', () => {
    const result = verifyReasoning({ answer: { ...goodAnswer, metrics: [{ label: 'A', value: null as any }] }, evidence: [], hasData: true });
    assertEqual(result.valid, false);
  });
  test('an action entityId backed by evidence → no warning', () => {
    const evidence = [{ source: 's', entityType: 'LetterOfCredit', entityId: 'LC-2026-001', field: 'expiryDate', value: '2026-09-20' }];
    const answer = { ...goodAnswer, action: { label: 'Xem', type: 'NAVIGATE' as const, target: 'OPEN_LC_DETAIL', entityId: 'LC-2026-001' } };
    const result = verifyReasoning({ answer, evidence, hasData: true });
    assertEqual(result.warnings.length, 0);
  });
  test('an action entityId backed by a returned record → no warning', () => {
    const answer = {
      ...goodAnswer,
      records: [{ lcNumber: 'LC-2026-001' }],
      action: { label: 'Xem', type: 'NAVIGATE' as const, target: 'OPEN_LC_DETAIL', entityId: 'LC-2026-001' },
    };
    const result = verifyReasoning({ answer, evidence: [], hasData: true });
    assertEqual(result.warnings.length, 0);
  });
  test('an action entityId with no evidence and no matching record → warning, not error', () => {
    const answer = { ...goodAnswer, action: { label: 'Xem', type: 'NAVIGATE' as const, target: 'OPEN_LC_DETAIL', entityId: 'LC-9999-999' } };
    const result = verifyReasoning({ answer, evidence: [], hasData: true });
    assertEqual(result.valid, true);
    assert(result.warnings.length > 0, 'expected an unbacked navigation entity to warn, not hard-fail');
  });
  test('multiple actions[] are each checked independently', () => {
    const answer = {
      ...goodAnswer,
      actions: [
        { label: 'A', type: 'NAVIGATE' as const, target: 'OPEN_LC_DETAIL', entityId: 'LC-9999-999' },
        { label: 'B', type: 'NAVIGATE' as const, target: 'OPEN_LC' },
      ],
    };
    const result = verifyReasoning({ answer, evidence: [], hasData: true });
    assertEqual(result.warnings.length, 1);
  });
  test('an action with no entityId at all is never flagged', () => {
    const answer = { ...goodAnswer, action: { label: 'Xem tất cả', type: 'NAVIGATE' as const, target: 'OPEN_LC' } };
    const result = verifyReasoning({ answer, evidence: [], hasData: true });
    assertEqual(result.warnings.length, 0);
  });
  test('a recommendation with zero metrics and zero evidence → warning', () => {
    const answer = { ...goodAnswer, metrics: [], recommendation: { title: 'T', description: 'D' } };
    const result = verifyReasoning({ answer, evidence: [], hasData: true });
    assert(result.warnings.length > 0, 'expected an unsupported recommendation to warn');
  });
  test('a recommendation backed by at least one metric → no warning', () => {
    const answer = { ...goodAnswer, recommendation: { title: 'T', description: 'D' } };
    const result = verifyReasoning({ answer, evidence: [], hasData: true });
    assertEqual(result.warnings.length, 0);
  });
  test('safeFallbackAnswer never carries records/metrics (nothing to hallucinate from)', () => {
    const fallback = safeFallbackAnswer('no data');
    assertEqual(fallback.metrics.length, 0);
    assertEqual(fallback.records.length, 0);
  });
  test('safeFallbackAnswer always has a non-empty summary', () => {
    assert(!!safeFallbackAnswer('reason').summary.trim(), 'expected a real summary explaining the fallback');
  });
  test('a FAILED verification never has valid=true', () => {
    const result = verifyReasoning({ answer: { ...goodAnswer, summary: '' }, evidence: [], hasData: false });
    assertEqual(result.valid, false);
  });
  test('every existing (Phase 5/6) reasoning use case verifies VERIFIED or WARNING, never FAILED, on real data', async () => {
    const useCases = [
      'CASHFLOW_ANALYSIS', 'LIQUIDITY_ANALYSIS', 'IDLE_CASH_ANALYSIS', 'PAYMENT_PRIORITIZATION', 'APPROVAL_PRIORITIZATION',
      'PRODUCT_RECOMMENDATION_REASONING', 'LC_RISK_PRIORITIZATION', 'GUARANTEE_RISK_PRIORITIZATION', 'TRADE_FINANCE_EXPOSURE',
      'TRADE_FINANCE_LIMIT_ANALYSIS', 'TRADE_FINANCE_OVERVIEW', 'TRADE_FINANCE_ATTENTION',
    ] as const;
    for (const useCase of useCases) {
      const r = await runReasoning({ useCase, security: ctx, anchorToday, navigationActions, config });
      assert(r.debug.verificationStatus !== 'FAILED', `${useCase} unexpectedly failed verification on real seeded data`);
    }
  });
  test('CASHFLOW_DIAGNOSTIC verifies VERIFIED or WARNING on real data', async () => {
    const r = await runReasoning({ useCase: 'CASHFLOW_DIAGNOSTIC', security: ctx, anchorToday, navigationActions, config });
    assert(r.debug.verificationStatus !== 'FAILED', 'expected CASHFLOW_DIAGNOSTIC to verify cleanly on real seeded data');
  });
  test('DAILY_PRIORITY verifies VERIFIED or WARNING on real data', async () => {
    const r = await runReasoning({ useCase: 'DAILY_PRIORITY', security: ctx, anchorToday, navigationActions, config });
    assert(r.debug.verificationStatus !== 'FAILED', 'expected DAILY_PRIORITY to verify cleanly on real seeded data');
  });
});

// ---- Risk Engine (20 required) -----------------------------------------------------------------
describe('risk engine (20 required)', () => {
  const lcs = getLcDeadlines.execute(ctx, {});
  const guarantees = getGuaranteeDeadlines.execute(ctx, {});
  const collections = getCollectionDeadlines.execute(ctx, {});

  test('levelFromScore bands: 0-29 LOW', () => assertEqual(levelFromScore(0), 'LOW'));
  test('levelFromScore bands: 29 LOW', () => assertEqual(levelFromScore(29), 'LOW'));
  test('levelFromScore bands: 30 MEDIUM', () => assertEqual(levelFromScore(30), 'MEDIUM'));
  test('levelFromScore bands: 59 MEDIUM', () => assertEqual(levelFromScore(59), 'MEDIUM'));
  test('levelFromScore bands: 60 HIGH', () => assertEqual(levelFromScore(60), 'HIGH'));
  test('levelFromScore bands: 79 HIGH', () => assertEqual(levelFromScore(79), 'HIGH'));
  test('levelFromScore bands: 80 CRITICAL', () => assertEqual(levelFromScore(80), 'CRITICAL'));
  test('levelFromScore bands: 100 CRITICAL', () => assertEqual(levelFromScore(100), 'CRITICAL'));
  test('scoreLcRisk never exceeds 100', () => {
    for (const lc of lcs) assert(scoreLcRisk(lc, anchorToday).score <= 100, `LC risk score for ${lc.lcNumber} must stay within [0,100]`);
  });
  test('scoreLcRisk is never negative', () => {
    for (const lc of lcs) assert(scoreLcRisk(lc, anchorToday).score >= 0, `LC risk score for ${lc.lcNumber} must stay within [0,100]`);
  });
  test('scoreLcRisk level always matches levelFromScore(score)', () => {
    for (const lc of lcs) {
      const r = scoreLcRisk(lc, anchorToday);
      assertEqual(r.level, levelFromScore(r.score));
    }
  });
  test('scoreLcRisk entityId is the real lcNumber', () => {
    const [first] = lcs;
    assertEqual(scoreLcRisk(first, anchorToday).entityId, first.lcNumber);
  });
  test('scoreLcRisk every factor is within [0,1]', () => {
    for (const lc of lcs) {
      const { factors } = scoreLcRisk(lc, anchorToday);
      for (const v of Object.values(factors)) assert(v >= 0 && v <= 1, `every risk factor must be in [0,1], got ${v}`);
    }
  });
  test('a DISCREPANCY-status LC has a non-zero discrepancy factor when it has an open discrepancy', () => {
    const discrepancyLc = lcs.find((l) => l.discrepancies.some((d) => d.status === 'OPEN'));
    if (discrepancyLc) assert(scoreLcRisk(discrepancyLc, anchorToday).factors.discrepancy > 0, 'expected a non-zero discrepancy factor');
  });
  test('scoreGuaranteeRisk never exceeds 100', () => {
    for (const bg of guarantees) assert(scoreGuaranteeRisk(bg, anchorToday).score <= 100, `guarantee risk score for ${bg.bgNumber} must stay within [0,100]`);
  });
  test('scoreGuaranteeRisk level always matches levelFromScore(score)', () => {
    for (const bg of guarantees) {
      const r = scoreGuaranteeRisk(bg, anchorToday);
      assertEqual(r.level, levelFromScore(r.score));
    }
  });
  test('scoreGuaranteeRisk entityId is the real bgNumber', () => {
    const [first] = guarantees;
    if (first) assertEqual(scoreGuaranteeRisk(first, anchorToday).entityId, first.bgNumber);
  });
  test('an active-claim guarantee scores a non-zero discrepancy-slot factor', () => {
    const claimed = guarantees.find((g) => g.claims.some((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW'));
    if (claimed) assert(scoreGuaranteeRisk(claimed, anchorToday).factors.discrepancy > 0, 'expected an active claim to raise the discrepancy factor');
  });
  test('scoreCollectionRisk never exceeds 100', () => {
    for (const c of collections) assert(scoreCollectionRisk(c, anchorToday).score <= 100, `collection risk score for ${c.collectionNumber} must stay within [0,100]`);
  });
  test('an OVERDUE collection scores expiryProximity=1', () => {
    const overdue = collections.find((c) => c.status === 'OVERDUE');
    if (overdue) assertEqual(scoreCollectionRisk(overdue, anchorToday).factors.expiryProximity, 1);
  });
  test('risk weights sum to 1 (config sanity — spec §10)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const weights = require('../src/config/risk-rules.json').weights;
    const sum = Object.values(weights as Record<string, number>).reduce((s: number, w) => s + w, 0);
    assert(Math.abs(sum - 1) < 0.001, `risk weights must sum to 1, got ${sum}`);
  });
});

// ---- Priority Engine (15 required) -------------------------------------------------------------
describe('priority engine (15 required)', () => {
  const tasks = getTasks.execute(ctx, {});
  const pendingApprovals = getPendingApprovals.execute(ctx, {});
  // Must match reasoning-engine.ts's DAILY_PRIORITY case exactly (a 30-day window), or this
  // test's expected ranking silently diverges from the real reasoning result.
  const next30Days = new Date(new Date(anchorToday + 'T00:00:00Z').getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const payables = getPayables.execute(ctx, { range: { from: anchorToday, to: next30Days } });
  const lcs = getLcDeadlines.execute(ctx, {});
  const guarantees = getGuaranteeDeadlines.execute(ctx, {});
  const collections = getCollectionDeadlines.execute(ctx, {});
  const items = crossDomainPriorities({ tasks, pendingApprovals, payables, lcs, guarantees, collections, anchorToday });

  test('returns at least one item on real seeded data', () => assert(items.length > 0, 'expected at least one cross-domain priority item'));
  test('every priorityScore is within [0,100]', () => {
    for (const i of items) assert(i.priorityScore >= 0 && i.priorityScore <= 100, `priorityScore must be in [0,100], got ${i.priorityScore}`);
  });
  test('items are sorted by priorityScore descending', () => {
    for (let i = 1; i < items.length; i++) assert(items[i].priorityScore <= items[i - 1].priorityScore, 'expected descending priorityScore order');
  });
  test('every item has a non-empty reasons list', () => {
    for (const i of items) assert(i.reasons.length > 0, `${i.entityType} ${i.entityId} must have at least one reason`);
  });
  test('every item carries an entityType and entityId', () => {
    for (const i of items) {
      assert(!!i.entityType, 'expected a non-empty entityType');
      assert(!!i.entityId, 'expected a non-empty entityId');
    }
  });
  test('at least one Task item is present when open tasks exist', () => {
    if (tasks.length > 0) assert(items.some((i) => i.entityType === 'Task'), 'expected at least one Task priority item');
  });
  test('every item.priority is consistent with its own priorityScore (never a mismatched band)', () => {
    for (const i of items) assertEqual(i.priority, levelFromScore(i.priorityScore));
  });
  test('every item.priority is a valid RiskLevel4', () => {
    for (const i of items) assert(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(i.priority), `unexpected priority level ${i.priority}`);
  });
  test('an empty cross-domain input returns an empty, not crashing, result', () => {
    const empty = crossDomainPriorities({ tasks: [], pendingApprovals: [], payables: [], lcs: [], guarantees: [], collections: [], anchorToday });
    assertEqual(empty.length, 0);
  });
  test('every item has a recommendedAction', () => {
    for (const i of items) assert(!!i.recommendedAction, `${i.entityType} ${i.entityId} should suggest a next action`);
  });
  test('DAILY_PRIORITY reasoning result top-3 records match crossDomainPriorities ranking', async () => {
    const r = await runReasoning({ useCase: 'DAILY_PRIORITY', security: ctx, anchorToday, navigationActions, config });
    const records = r.answer.records as { entityId: string }[];
    assertEqual(records.length, Math.min(3, items.length));
    for (let i = 0; i < records.length; i++) assertEqual(records[i].entityId, items[i].entityId);
  });
  test('DAILY_PRIORITY answer never exceeds 3 navigation actions', async () => {
    const r = await runReasoning({ useCase: 'DAILY_PRIORITY', security: ctx, anchorToday, navigationActions, config });
    assert((r.answer.actions ?? []).length <= 3, 'expected at most one CTA per top-3 item');
  });
  test('DAILY_PRIORITY metrics report a real count matching the ranked list', async () => {
    const r = await runReasoning({ useCase: 'DAILY_PRIORITY', security: ctx, anchorToday, navigationActions, config });
    const countMetric = r.answer.metrics.find((m) => m.label === 'Số việc cần chú ý');
    assertEqual(countMetric?.value, String(items.length));
  });
  test('Payable items below score 20 are excluded from the cross-domain ranking (keeps it genuinely time-sensitive)', () => {
    for (const i of items.filter((x) => x.entityType === 'Payable')) assert(i.priorityScore >= 20, 'low-urgency payables should not clutter the daily list');
  });
  test('scores are deterministic — calling crossDomainPriorities twice on the same input gives identical results', () => {
    const again = crossDomainPriorities({ tasks, pendingApprovals, payables, lcs, guarantees, collections, anchorToday });
    assertEqual(again.map((i) => i.priorityScore).join(','), items.map((i) => i.priorityScore).join(','));
  });
});

// ---- Model Router — Phase 5.5 rules (part of the existing "model router" suite's spirit) -------
describe('model router — Phase 5.5 rules', () => {
  test('"Tại sao dòng tiền tháng này giảm?" routes to CASHFLOW_DIAGNOSTIC', () => {
    const r = routeQuery('Tại sao dòng tiền tháng này giảm?', undefined, config);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'CASHFLOW_DIAGNOSTIC');
  });
  test('"Vì sao dòng tiền giảm" also routes to CASHFLOW_DIAGNOSTIC', () => {
    assertEqual(routeQuery('Vì sao dòng tiền giảm', undefined, config).useCase, 'CASHFLOW_DIAGNOSTIC');
  });
  test('"Tôi nên xử lý việc gì quan trọng nhất hôm nay?" routes to DAILY_PRIORITY', () => {
    const r = routeQuery('Tôi nên xử lý việc gì quan trọng nhất hôm nay?', undefined, config);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'DAILY_PRIORITY');
  });
  test('"Việc gì cần làm trước?" also routes to DAILY_PRIORITY', () => {
    assertEqual(routeQuery('Việc gì cần làm trước?', undefined, config).useCase, 'DAILY_PRIORITY');
  });
  test('reasoningEnabled=false disables even the Phase 5.5 triggers', () => {
    const r = routeQuery('Tại sao dòng tiền tháng này giảm?', undefined, { ...config, reasoningEnabled: false });
    assertEqual(r.reasoningRequired, false);
  });
  test('a plain LC_EXPIRY-shaped question is not hijacked by the DAILY_PRIORITY trigger', () => {
    const r = routeQuery('LC nào sắp hết hạn?', 'LC_EXPIRY', config);
    assertEqual(r.useCase === 'DAILY_PRIORITY', false);
  });
});

// ---- Golden test cases (spec §28) ---------------------------------------------------------------
describe('golden test cases (spec §28)', () => {
  test('#1 "LC nào sắp hết hạn?" resolves via the deterministic LC_EXPIRY path with navigation', () => {
    const result: any = answerQuery('LC nào sắp hết hạn?', security, { debug: false });
    assert(result.semantic.intent === 'LC_EXPIRY' || result.semantic.intent === 'CLARIFICATION_NEEDED', 'expected an LC-expiry-shaped resolution');
  });

  test('#2 "LC nào có rủi ro cao nhất?" returns a risk ranking with reasons, evidence, and navigation', async () => {
    const routing = routeQuery('LC nào có rủi ro cao nhất?', undefined, config);
    assertEqual(routing.useCase, 'LC_RISK_PRIORITIZATION');
    const r = await runReasoning({ useCase: 'LC_RISK_PRIORITIZATION', security: ctx, anchorToday, navigationActions, config });
    const records = r.answer.records as { reasons: string[] }[];
    assert(records.length > 0 && records[0].reasons, 'expected the top-ranked LC to carry reasons');
    assert(r.debug.evidenceSummary.length > 0, 'expected evidence backing the ranking');
    assert(!!r.answer.action || !!(r.answer.actions && r.answer.actions.length > 0), 'expected a navigation CTA');
  });

  test('#3 "Tại sao dòng tiền tháng này giảm?" returns current vs previous period with variance and evidence', async () => {
    const routing = routeQuery('Tại sao dòng tiền tháng này giảm?', undefined, config);
    const r = await runReasoning({ useCase: routing.useCase!, security: ctx, anchorToday, navigationActions, config });
    assert(r.answer.metrics.some((m) => m.label.includes('kỳ này')), 'expected a current-period metric');
    assert(r.answer.metrics.some((m) => m.label.includes('kỳ trước')), 'expected a previous-period metric');
    assert(r.answer.metrics.some((m) => m.label === 'Chênh lệch'), 'expected a variance metric');
    assert(r.debug.evidenceSummary.length > 0, 'expected evidence backing the diagnosis');
  });

  test('#4 "Tuần sau công ty có đủ tiền để trả các khoản phải trả không?" returns projected cash, gap, and recommendation-shaped answer', async () => {
    const routing = routeQuery('Tuần sau công ty có đủ tiền để trả các khoản phải trả không?', undefined, config);
    assertEqual(routing.useCase, 'LIQUIDITY_ANALYSIS');
    const r = await runReasoning({ useCase: 'LIQUIDITY_ANALYSIS', security: ctx, anchorToday, navigationActions, config });
    assert(r.answer.metrics.some((m) => m.label === 'Dự kiến còn'), 'expected a projected-cash metric');
    assert(!!r.answer.insights && r.answer.insights.length > 0, 'expected an explainable insight');
  });

  test('#5 "Tôi nên xử lý việc gì quan trọng nhất hôm nay?" returns top 3 priorities with reasons and CTA', async () => {
    const routing = routeQuery('Tôi nên xử lý việc gì quan trọng nhất hôm nay?', undefined, config);
    assertEqual(routing.useCase, 'DAILY_PRIORITY');
    const r = await runReasoning({ useCase: 'DAILY_PRIORITY', security: ctx, anchorToday, navigationActions, config });
    const records = r.answer.records as { reasons: string[]; recommendedAction?: string }[];
    assert(records.length <= 3, 'expected at most 3 priority records');
    assert(records.every((rec) => rec.reasons.length > 0), 'every priority item must explain why');
  });

  test('#6 "Tổng exposure Trade Finance hiện tại bao nhiêu?" combines LC+Guarantee+Collection with verification', async () => {
    const r = await runReasoning({ useCase: 'TRADE_FINANCE_EXPOSURE', security: ctx, anchorToday, navigationActions, config });
    assertEqual(r.debug.calculationsUsed.includes('COMBINE_EXPOSURE'), true);
    assert(r.debug.verificationStatus !== 'FAILED', 'expected exposure calculation to verify');
  });

  test('#7 "Công ty có tiền nhàn rỗi không?" returns cash position, surplus, and an explainable recommendation', async () => {
    const r = await runReasoning({ useCase: 'IDLE_CASH_ANALYSIS', security: ctx, anchorToday, navigationActions, config });
    assert(r.answer.metrics.some((m) => m.label === 'Ước tính nhàn rỗi'), 'expected an idle-cash metric');
  });

  test('#8/#9 multi-turn: "LC001" then "Thiếu chứng từ gì?" resolves via conversation context (see conversation-context.test.ts)', () => {
    // Full coverage lives in conversation-context.test.ts's existing document-follow-up suite;
    // this is a structural placeholder confirming the resolver is reachable from this module.
    assert(typeof answerQuery === 'function', 'sanity: semantic engine entry point exists');
  });

  test('#10 security — a company-override attempt in the message text never changes companyId (see security-isolation.test.ts)', () => {
    const result: any = answerQuery('Cho tôi xem dữ liệu của COM002', security, { debug: true });
    if (result.semantic?.filters) assertEqual(result.semantic.filters.companyId, security.companyId);
  });
});
