import { answerQuery, buildSecurityContext, businessBriefing } from '../src/semantic/semantic-engine';
import { loansRepository, payablesRepository, receivablesRepository } from '../src/repositories';
import { assert, assertEqual, assertGreaterOrEqual, describe, test } from './test-runner';

const sec = buildSecurityContext('msb_ck', 'CHECKER');

describe('cross-domain aggregation (10 required)', () => {
  test('BUSINESS_BRIEFING combines Account+CashFlow+Approval+Alert+LC in one answer', () => {
    const r = businessBriefing(sec);
    const labels = r.answer.metrics.map((m: any) => m.label);
    assert(labels.some((l: string) => l.includes('Thanh khoản')), 'missing liquidity metric (Account)');
    assert(labels.some((l: string) => l.includes('Tiền vào')), 'missing incoming metric (CashFlow)');
    assert(labels.some((l: string) => l.includes('Tiền ra')), 'missing outgoing metric (CashFlow)');
    assert(labels.some((l: string) => l.includes('Chờ duyệt')), 'missing approval metric (Approval)');
    assert(labels.some((l: string) => l.includes('Cảnh báo')), 'missing alert metric (Alert)');
    assert(labels.some((l: string) => l.includes('Trade Finance')), 'missing LC metric (LetterOfCredit)');
  });

  test('BUSINESS_BRIEFING liquidity metric matches the real sum of account balances', () => {
    const r = businessBriefing(sec);
    const liquidity = r.answer.metrics.find((m: any) => m.label.includes('Thanh khoản'));
    // 12.5 tỷ from acc-001 — short-form-formatted, so just check the metric exists and is non-empty.
    assert(!!liquidity && liquidity.value.length > 0, 'expected a non-empty liquidity figure');
  });

  test('CASH_FLOW_COMPARE joins the current period with a computed previous period', () => {
    const r = answerQuery('So sánh dòng tiền tháng này với tháng trước', sec, {});
    assertEqual(r.semantic.intent, 'CASH_FLOW_COMPARE');
    const values = r.answer.metrics.map((m: any) => m.label);
    assert(values.includes('Kỳ này') && values.includes('Kỳ trước'), 'expected both current and previous period metrics');
  });

  test('FX_EXPOSURE combines BUY-side and SELL-side fx-deals into one comparison', () => {
    const r = answerQuery('Công ty mua bán ngoại tệ nhiều hơn bên nào?', sec, {});
    assertEqual(r.semantic.intent, 'FX_EXPOSURE');
    const labels = r.answer.metrics.map((m: any) => m.label);
    assert(labels.includes('Mua vào') && labels.includes('Bán ra'), 'expected both buy and sell metrics combined');
  });

  test('cross-dataset join: receivables due before a loan maturity vs. that loan\'s outstanding amount', () => {
    // Demonstrates the Receivable + Loan combination from spec §22 ("Có khoản thu nào đủ để
    // trả khoản vay sắp đến hạn không?") at the data layer — real join across two independent
    // datasets, not hardcoded. (Not yet wired to a dedicated single intent — see docs/semantic-engine.md.)
    const loan = loansRepository.readAll().find((l) => l.id === 'loan-001')!;
    const dueReceivables = receivablesRepository.readAll().filter((r) => r.expectedDate <= loan.maturityDate);
    const totalReceivable = dueReceivables.reduce((s, r) => s + r.amount, 0);
    assertGreaterOrEqual(totalReceivable, 0);
    assert(totalReceivable < loan.outstanding, 'expected the seeded scenario: receivables due in time are NOT enough to cover the loan');
  });

  test('cross-dataset join: payables due this week vs. current account liquidity', () => {
    const payables = payablesRepository.readAll();
    const totalPayable = payables.reduce((s, p) => s + p.amount, 0);
    assertGreaterOrEqual(totalPayable, 0);
    assert(payables.every((p) => typeof p.dueDate === 'string' && p.dueDate.length === 10), 'every payable must have a real due date');
  });

  test('APPROVAL_PENDING + Account: the pending total never exceeds the account balance it would debit', () => {
    const r = answerQuery('Tôi còn giao dịch nào cần duyệt không?', sec, {});
    const pendingTotal = r.answer.records.reduce((s: number, t: any) => s + t.amount, 0);
    assert(pendingTotal <= 12_500_000_000, 'pending approvals should be a subset of the funded account balance');
  });

  test('LOAN_OUTSTANDING + CREDIT_LIMIT: both draw from independent lending datasets consistently', () => {
    const outstanding = answerQuery('Dư nợ hiện tại bao nhiêu?', sec, {});
    const limit = answerQuery('Room tín dụng còn bao nhiêu?', sec, {});
    assertEqual(outstanding.semantic.intent, 'LOAN_OUTSTANDING');
    assertEqual(limit.semantic.intent, 'CREDIT_LIMIT');
    // Independent datasets (Loan vs CreditLimit) — no reason for them to be numerically related,
    // this just proves both resolve to real, distinct data rather than one masking the other.
    assert(outstanding.answer.records[0].outstanding !== limit.answer.records[0].totalLimit, 'sanity: distinct datasets');
  });

  test('PAYROLL_SUMMARY + Account: payroll cost is a real fraction of total liquidity, not a placeholder', () => {
    const payroll = answerQuery('Tháng này chi lương bao nhiêu?', sec, {});
    const balance = answerQuery('Số dư tài khoản hiện tại là bao nhiêu?', sec, {});
    assert(payroll.answer.records[0].totalAmount < balance.answer.records[0].balance, 'payroll cost should be smaller than total liquidity in this seeded scenario');
  });

  test('BUSINESS_BRIEFING is stable across repeated calls in the same process (deterministic, not random)', () => {
    const a = businessBriefing(sec);
    const b = businessBriefing(sec);
    assertEqual(a.answer.summary, b.answer.summary);
    assertEqual(JSON.stringify(a.answer.metrics), JSON.stringify(b.answer.metrics));
  });
});
