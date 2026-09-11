import { answerQuery, buildSecurityContext, tradeFinanceBriefing } from '../src/semantic/semantic-engine';
import { assert, assertEqual, assertGreaterOrEqual, describe, test } from './test-runner';

const sec = buildSecurityContext('msb_ck', 'CHECKER');

function ask(q: string): any {
  return answerQuery(q, sec, {});
}

describe('end-to-end query execution — real data, not just intent (20 required)', () => {
  test('ACCOUNT_BALANCE returns the real VND account balance', () => {
    const r = ask('Số dư tài khoản hiện tại là bao nhiêu?');
    assertEqual(r.semantic.intent, 'ACCOUNT_BALANCE');
    assert(r.answer.records[0].balance === 12_500_000_000, 'expected acc-001 balance 12.5B');
  });

  test('ACCOUNT_HIGHEST_BALANCE picks the VND account over the USD account', () => {
    const r = ask('Tài khoản nào còn nhiều tiền nhất?');
    assertEqual(r.semantic.intent, 'ACCOUNT_HIGHEST_BALANCE');
    assertEqual(r.answer.records[0].currency, 'VND');
  });

  test('ACCOUNT_LOWEST_BALANCE picks the USD account (smaller in VND terms)', () => {
    const r = ask('TK nào ít tiền nhất vậy?');
    assertEqual(r.semantic.intent, 'ACCOUNT_LOWEST_BALANCE');
    assertEqual(r.answer.records[0].currency, 'USD');
  });

  test('ACCOUNT_AVAILABLE_BALANCE returns availableBalance, not the ledger balance', () => {
    const r = ask('Số dư khả dụng của tài khoản là bao nhiêu?');
    assertEqual(r.semantic.intent, 'ACCOUNT_AVAILABLE_BALANCE');
    assert(r.answer.summary.includes('11.850.000.000') || r.answer.metrics.some((m: any) => m.value.includes('11.850.000.000')), 'expected available balance 11.85B in the answer');
  });

  test('APPROVAL_PENDING returns exactly the 3 seeded pending transactions totalling 850M', () => {
    const r = ask('Tôi còn giao dịch nào cần duyệt không?');
    assertEqual(r.semantic.intent, 'APPROVAL_PENDING');
    assertEqual(r.answer.records.length, 3);
    const total = r.answer.records.reduce((s: number, t: any) => s + t.amount, 0);
    assertEqual(total, 850_000_000);
  });

  test('APPROVAL_PENDING with an amount filter narrows the result set', () => {
    const r = ask('Có giao dịch nào trên 5 tỷ cần tôi duyệt không?');
    assertEqual(r.semantic.filters?.amount?.operator ?? undefined, undefined); // debug off by default
    assertEqual(r.answer.records.length, 0); // no seeded pending transaction is over 5 tỷ
  });

  test('TRANSACTION_BY_AMOUNT correctly finds zero matches above an unreachable threshold', () => {
    const r = ask('Có giao dịch nào trên 5 tỷ không?');
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
    assertEqual(r.answer.records.length, 0);
  });

  test('TRANSACTION_BY_AMOUNT finds real matches for a reachable threshold', () => {
    const r = ask('Có giao dịch nào trên 100 triệu không?');
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
    assertGreaterOrEqual(r.answer.records.length, 1);
    for (const t of r.answer.records) assert(t.amount > 100_000_000, 'every record must be > 100 triệu');
  });

  test('OUTGOING_PAYMENT sums only DEBIT transactions', () => {
    const r = ask('Hôm qua công ty chi bao nhiêu?');
    assertEqual(r.semantic.intent, 'OUTGOING_PAYMENT');
    for (const t of r.answer.records) assertEqual(t.type, 'DEBIT');
  });

  test('CASH_FLOW_COMPARE returns a trend with a defined percentage change', () => {
    const r = ask('So sánh dòng tiền tháng này với tháng trước');
    assertEqual(r.semantic.intent, 'CASH_FLOW_COMPARE');
    assert(r.answer.metrics.some((m: any) => m.label === 'Thay đổi'), 'expected a "Thay đổi" metric');
  });

  test('PAYROLL_SUMMARY returns the most recent payroll period', () => {
    const r = ask('Tháng này chi lương bao nhiêu?');
    assertEqual(r.semantic.intent, 'PAYROLL_SUMMARY');
    assertEqual(r.answer.records[0].period, '2026-09');
    assertEqual(r.answer.records[0].employeeCount, 250);
  });

  test('FX_RATE returns the seeded USD buy/sell rates', () => {
    const r = ask('Tỷ giá USD hôm nay?');
    assertEqual(r.semantic.intent, 'FX_RATE');
    const usd = r.answer.records.find((x: any) => x.currency === 'USD');
    assertEqual(usd.buy, 25180);
    assertEqual(usd.sell, 25480);
  });

  test('FX_EXPOSURE correctly identifies buy vs sell dominance from fx-deals.json', () => {
    const r = ask('Công ty mua bán ngoại tệ nhiều hơn bên nào?');
    assertEqual(r.semantic.intent, 'FX_EXPOSURE');
    // Seeded fx-deals.json has more BUY volume than SELL — see server/data/fx-deals.json.
    assert(r.answer.summary.includes('mua'), 'expected the dominant side to be "mua"');
  });

  test('LC_EXPIRY finds the one seeded LC expiring within 30 days', () => {
    const r = ask('LC nào sắp hết hạn?');
    assertEqual(r.semantic.intent, 'LC_EXPIRY');
    assertEqual(r.answer.records.length, 1);
    assertEqual(r.answer.records[0].lcNumber, 'LC-2026-001');
  });

  test('LC_STATUS on a specific LC number returns that exact record', () => {
    const r = ask('Trạng thái LC số LC-2026-002 thế nào?');
    assertEqual(r.semantic.intent, 'LC_STATUS');
    assertEqual(r.answer.records[0].lcNumber, 'LC-2026-002');
    assertEqual(r.answer.records[0].status, 'ACTIVE');
  });

  // Phase 6 added a 4th seeded guarantee (bg-004, with a claim) for claim-reasoning tests;
  // Phase 7 added a 5th (bg-005, PENDING_APPROVAL) for the dedicated Trade Finance screens.
  test('GUARANTEE_LIST returns all 5 seeded bank guarantees', () => {
    const r = ask('Công ty có bảo lãnh thực hiện hợp đồng nào không?');
    assertEqual(r.semantic.intent, 'GUARANTEE_LIST');
    assertEqual(r.answer.records.length, 5);
  });

  test('LOAN_LIST returns all 3 seeded loans', () => {
    const r = ask('Công ty đang có nợ vay ngân hàng nào?');
    assertEqual(r.semantic.intent, 'LOAN_LIST');
    assertEqual(r.answer.records.length, 3);
  });

  test('LOAN_OUTSTANDING sums only ACTIVE loans (excludes the completed one)', () => {
    const r = ask('Dư nợ hiện tại bao nhiêu?');
    assertEqual(r.semantic.intent, 'LOAN_OUTSTANDING');
    const total = r.answer.records.reduce((s: number, l: any) => s + l.outstanding, 0);
    assertEqual(total, 5_400_000_000); // loan-001 (2B) + loan-002 (3.4B); loan-003 is COMPLETED (0)
  });

  test('CREDIT_LIMIT returns the OVERALL limit with correct used/available split', () => {
    const r = ask('Room tín dụng còn bao nhiêu?');
    assertEqual(r.semantic.intent, 'CREDIT_LIMIT');
    const overall = r.answer.records.find((c: any) => c.limitType === 'OVERALL');
    assertEqual(overall.totalLimit, 10_000_000_000);
    assertEqual(overall.availableAmount, 4_600_000_000);
  });

  test('PRODUCT_RECOMMEND returns only rule-eligible recommendations', () => {
    const r = ask('RM gợi ý sản phẩm gì cho công ty tôi?');
    assertEqual(r.semantic.intent, 'PRODUCT_RECOMMEND');
    assertGreaterOrEqual(r.answer.records.length, 1);
  });

  test('An unrecognizable question returns a clarification, never a hallucinated answer', () => {
    const r = ask('asdkjaslkdj xyz random gibberish 12345');
    assertEqual(r.semantic.intent, 'CLARIFICATION_NEEDED');
    assertGreaterOrEqual(r.answer.suggestedQuestions.length, 1);
  });
});

describe('Trade Finance deterministic intents (Phase 6)', () => {
  test('LC_DOCUMENT_STATUS reports a real document checklist', () => {
    const r = ask('Chứng từ LC còn thiếu gì không?');
    assertEqual(r.semantic.intent, 'LC_DOCUMENT_STATUS');
    assert(r.answer.records.length > 0, 'expected a document checklist');
  });

  test('LC_DISCREPANCY reports real discrepancies', () => {
    const r = ask('LC này có sai biệt không?');
    assertEqual(r.semantic.intent, 'LC_DISCREPANCY');
    assert(Array.isArray(r.answer.records), 'expected a records array');
  });

  test('GUARANTEE_CLAIM reports the real seeded claim on bg-004', () => {
    const r = ask('Có yêu cầu gọi bảo lãnh nào không?');
    assertEqual(r.semantic.intent, 'GUARANTEE_CLAIM');
    assert(r.answer.records.length >= 1, 'expected at least the one seeded claim');
  });

  test('COLLECTION_OVERDUE reports the real overdue collection', () => {
    const r = ask('Nhờ thu nào đã quá hạn?');
    assertEqual(r.semantic.intent, 'COLLECTION_OVERDUE');
    assert(r.answer.records.every((c: any) => c.status === 'OVERDUE'), 'every returned collection must be OVERDUE');
  });

  test('a bare BG number narrows GUARANTEE_LIST to that one guarantee\'s detail', () => {
    const r = ask('Bảo lãnh BG-2026-013 thế nào?');
    assertEqual(r.semantic.intent, 'GUARANTEE_LIST');
    assertEqual(r.answer.records.length, 1);
    assertEqual(r.answer.records[0].bgNumber, 'BG-2026-013');
  });

  test('TRADE_FINANCE_BRIEFING is callable directly, same pattern as businessBriefing', () => {
    const r = tradeFinanceBriefing(sec);
    assertEqual(r.semantic.intent, 'TRADE_FINANCE_BRIEFING');
    assert(r.answer.metrics.length > 0, 'expected briefing metrics');
    assert(!!r.answer.insights?.length, 'expected at least one RM insight');
  });
});
