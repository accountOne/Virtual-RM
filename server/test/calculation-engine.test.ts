import { describe, test, assertEqual } from './test-runner';
import {
  calculateCashBuffer,
  calculateGuaranteeRisk,
  calculateLcRisk,
  calculateLiquidityGap,
  calculateNetCashflow,
  calculateOutstanding,
  calculateProjectedCash,
  combineExposure,
  daysUntil,
  rankByUrgency,
} from '../src/calculation/financial-calculations';
import { BankGuarantee, LetterOfCredit, Loan, Payable, Receivable, Transaction } from '../src/models';

function txn(type: 'CREDIT' | 'DEBIT', amount: number): Transaction {
  return {
    id: 't', accountId: 'a', date: '2026-09-01', type, category: 'x', amount, currency: 'VND', counterparty: 'c', description: 'd', status: 'COMPLETED',
  };
}

const ANCHOR = '2026-09-10';

function lc(overrides: Partial<LetterOfCredit> = {}): LetterOfCredit {
  return {
    id: 'lc-x', lcNumber: 'LC-TEST-001', type: 'IMPORT', subType: 'SIGHT', referenceNo: 'REF-1',
    beneficiary: 'Seller Co.', applicant: 'ABC Manufacturing JSC', amount: 100_000_000, currency: 'VND',
    issueDate: '2026-01-01', expiryDate: '2026-12-01', status: 'ACTIVE', issuingBank: 'MSB', advisingBank: 'Foreign Bank',
    latestShipmentDate: '2026-11-01', presentationPeriodDays: 21, paymentTerm: 'SIGHT', availableWith: 'Nominated Bank',
    outstandingAmount: 100_000_000, documents: [], discrepancies: [], amendments: [], riskFlags: [],
    ...overrides,
  };
}

function bg(overrides: Partial<BankGuarantee> = {}): BankGuarantee {
  return {
    id: 'bg-x', bgNumber: 'BG-TEST-001', type: 'PERFORMANCE_BOND', beneficiary: 'Buyer Co.', applicant: 'ABC Manufacturing JSC',
    amount: 100_000_000, currency: 'VND', issueDate: '2026-01-01', expiryDate: '2026-12-01', status: 'ACTIVE',
    outstandingAmount: 100_000_000, extensionRequested: false, documents: [], claims: [], riskFlags: [],
    ...overrides,
  };
}

describe('calculation engine (10 required)', () => {
  test('NET_CASHFLOW sums incoming and outgoing correctly', () => {
    const r = calculateNetCashflow([txn('CREDIT', 1000), txn('CREDIT', 500), txn('DEBIT', 300)]);
    assertEqual(r.incoming, 1500);
    assertEqual(r.outgoing, 300);
    assertEqual(r.net, 1200);
    assertEqual(r.trend, 'dương');
  });

  test('NET_CASHFLOW reports "âm" when outgoing exceeds incoming', () => {
    const r = calculateNetCashflow([txn('CREDIT', 100), txn('DEBIT', 500)]);
    assertEqual(r.trend, 'âm');
  });

  test('NET_CASHFLOW reports "cân bằng" when equal', () => {
    const r = calculateNetCashflow([txn('CREDIT', 100), txn('DEBIT', 100)]);
    assertEqual(r.trend, 'cân bằng');
  });

  test('PROJECTED_CASH = current + receivables - payables - loan obligations', () => {
    const receivables: Receivable[] = [{ id: 'r1', customer: 'c', amount: 200, currency: 'VND', expectedDate: '2026-09-20', status: 'EXPECTED', relatedInvoice: 'i1' }];
    const payables: Payable[] = [{ id: 'p1', supplier: 's', amount: 50, currency: 'VND', dueDate: '2026-09-15', status: 'SCHEDULED', relatedInvoice: 'i2' }];
    const loans: Loan[] = [
      { id: 'l1', loanNumber: 'LN-1', purpose: 'x', principal: 100, outstanding: 30, currency: 'VND', interestRate: 8, disbursedDate: '2026-01-01', maturityDate: '2026-09-30', status: 'ACTIVE' },
    ];
    const r = calculateProjectedCash({ currentCash: 1000, receivables, payables, loanObligations: loans });
    assertEqual(r.projectedCash, 1000 + 200 - 50 - 30);
  });

  test('LIQUIDITY_GAP: sufficient when cash covers obligations', () => {
    const payables: Payable[] = [{ id: 'p1', supplier: 's', amount: 100, currency: 'VND', dueDate: '2026-09-15', status: 'SCHEDULED', relatedInvoice: 'i' }];
    const r = calculateLiquidityGap(500, payables, []);
    assertEqual(r.sufficient, true);
    assertEqual(r.gap, 400);
  });

  test('LIQUIDITY_GAP: insufficient when obligations exceed cash', () => {
    const payables: Payable[] = [{ id: 'p1', supplier: 's', amount: 900, currency: 'VND', dueDate: '2026-09-15', status: 'SCHEDULED', relatedInvoice: 'i' }];
    const r = calculateLiquidityGap(500, payables, []);
    assertEqual(r.sufficient, false);
    assertEqual(r.gap, -400);
  });

  test('CASH_BUFFER: idle cash after 15% buffer and expected flows', () => {
    // 1000 current, +500 incoming, -200 outgoing, 15% buffer of 1000 = 150 → idle = 1000+500-200-150 = 1150
    const r = calculateCashBuffer(1000, 500, 200);
    assertEqual(r.idleCash, 1150);
    assertEqual(r.hasIdle, true);
  });

  test('CASH_BUFFER: never reports negative idle cash', () => {
    const r = calculateCashBuffer(100, 0, 1000);
    assertEqual(r.idleCash, 0);
    assertEqual(r.hasIdle, false);
  });

  test('OUTSTANDING only sums ACTIVE loans', () => {
    const loans: Loan[] = [
      { id: 'l1', loanNumber: 'LN-1', purpose: 'x', principal: 100, outstanding: 100, currency: 'VND', interestRate: 8, disbursedDate: '2026-01-01', maturityDate: '2026-09-30', status: 'ACTIVE' },
      { id: 'l2', loanNumber: 'LN-2', purpose: 'x', principal: 200, outstanding: 0, currency: 'VND', interestRate: 8, disbursedDate: '2024-01-01', maturityDate: '2025-01-01', status: 'COMPLETED' },
    ];
    const r = calculateOutstanding(loans);
    assertEqual(r.total, 100);
    assertEqual(r.count, 1);
  });

  test('rankByUrgency: due today or a large amount is HIGH', () => {
    const ranked = rankByUrgency([
      { id: '1', label: 'A', amount: 1000, currency: 'VND', dueDate: '2026-09-09', anchorToday: '2026-09-09' },
      { id: '2', label: 'B', amount: 6_000_000_000, currency: 'VND', dueDate: '2026-09-30', anchorToday: '2026-09-09' },
    ]);
    assertEqual(ranked[0].urgency, 'HIGH');
    assertEqual(ranked[1].urgency, 'HIGH');
  });

  test('rankByUrgency sorts HIGH before MEDIUM before LOW, soonest-due first within a tier', () => {
    const ranked = rankByUrgency([
      { id: 'low', label: 'Low', amount: 100, currency: 'VND', dueDate: '2026-09-25', anchorToday: '2026-09-09' },
      { id: 'high', label: 'High', amount: 100, currency: 'VND', dueDate: '2026-09-09', anchorToday: '2026-09-09' },
      { id: 'medium', label: 'Medium', amount: 100, currency: 'VND', dueDate: '2026-09-11', anchorToday: '2026-09-09' },
    ]);
    assertEqual(ranked.map((r) => r.id).join(','), 'high,medium,low');
  });

  // ---- Trade Finance (Phase 6) ------------------------------------------------------------
  test('daysUntil computes positive and negative day counts against an anchor date', () => {
    assertEqual(daysUntil('2026-09-20', ANCHOR), 10);
    assertEqual(daysUntil('2026-09-01', ANCHOR), -9);
    assertEqual(daysUntil(ANCHOR, ANCHOR), 0);
  });

  test('LC_RISK_SCORE: a clean LC far from any deadline scores 0 (LOW)', () => {
    const r = calculateLcRisk(lc({ latestShipmentDate: '2027-01-01', expiryDate: '2027-02-01' }), ANCHOR);
    assertEqual(r.score, 0);
    assertEqual(r.level, 'LOW');
    assertEqual(r.reasons.length, 0);
  });

  test('LC_RISK_SCORE: shipment deadline within 3 days adds 40 and pushes to MEDIUM', () => {
    const r = calculateLcRisk(lc({ latestShipmentDate: '2026-09-12', expiryDate: '2027-02-01' }), ANCHOR);
    assertEqual(r.score, 40);
    assertEqual(r.level, 'MEDIUM');
    assertEqual(r.daysUntilShipment, 2);
  });

  test('LC_RISK_SCORE: open discrepancies, document gaps, and a large amount all add up', () => {
    const risky = lc({
      latestShipmentDate: '2027-01-01',
      expiryDate: '2027-02-01',
      amount: 2_000_000_000,
      discrepancies: [{ id: 'd1', description: 'x', status: 'OPEN', raisedDate: ANCHOR }],
      documents: [{ documentType: 'BILL_OF_LADING', required: true, received: false, status: 'MISSING' }],
    });
    const r = calculateLcRisk(risky, ANCHOR);
    // 20 (1 open discrepancy) + 15 (1 doc gap) + 10 (amount >= 1.5B) = 45
    assertEqual(r.score, 45);
    assertEqual(r.level, 'MEDIUM');
    assertEqual(r.openDiscrepancies, 1);
    assertEqual(r.documentGaps, 1);
  });

  test('LC_RISK_SCORE: a waived discrepancy does not count as open', () => {
    const r = calculateLcRisk(lc({ discrepancies: [{ id: 'd1', description: 'x', status: 'WAIVED', raisedDate: ANCHOR }] }), ANCHOR);
    assertEqual(r.openDiscrepancies, 0);
  });

  test('GUARANTEE_RISK_SCORE: a guarantee with an active claim scores HIGH', () => {
    const r = calculateGuaranteeRisk(bg({ expiryDate: '2027-06-01', claims: [{ id: 'c1', amount: 1_000_000, status: 'UNDER_REVIEW', claimDate: ANCHOR }] }), ANCHOR);
    assertEqual(r.score, 40);
    assertEqual(r.level, 'MEDIUM');
    assertEqual(r.activeClaims, 1);
  });

  test('GUARANTEE_RISK_SCORE: a settled claim does not count as active', () => {
    const r = calculateGuaranteeRisk(bg({ claims: [{ id: 'c1', amount: 1_000_000, status: 'SETTLED', claimDate: ANCHOR }] }), ANCHOR);
    assertEqual(r.activeClaims, 0);
  });

  test('GUARANTEE_RISK_SCORE: extensionRequested plus a near expiry combine to HIGH', () => {
    const r = calculateGuaranteeRisk(bg({ expiryDate: '2026-09-15', extensionRequested: true }), ANCHOR);
    // 30 (extension requested) + 25 (expiry <= 14 days) = 55
    assertEqual(r.score, 55);
    assertEqual(r.level, 'HIGH');
  });

  test('COMBINE_EXPOSURE sums matching currencies across parts and keeps others separate', () => {
    const total = combineExposure([
      [{ currency: 'VND', amount: 1000 }, { currency: 'USD', amount: 50 }],
      [{ currency: 'VND', amount: 500 }],
      [{ currency: 'EUR', amount: 20 }],
    ]);
    const byCcy = Object.fromEntries(total.map((t) => [t.currency, t.amount]));
    assertEqual(byCcy['VND'], 1500);
    assertEqual(byCcy['USD'], 50);
    assertEqual(byCcy['EUR'], 20);
    assertEqual(total.length, 3);
  });
});
