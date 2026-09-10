import { describe, test, assertEqual } from './test-runner';
import {
  calculateCashBuffer,
  calculateLiquidityGap,
  calculateNetCashflow,
  calculateOutstanding,
  calculateProjectedCash,
  rankByUrgency,
} from '../src/calculation/financial-calculations';
import { Loan, Payable, Receivable, Transaction } from '../src/models';

function txn(type: 'CREDIT' | 'DEBIT', amount: number): Transaction {
  return {
    id: 't', accountId: 'a', date: '2026-09-01', type, category: 'x', amount, currency: 'VND', counterparty: 'c', description: 'd', status: 'COMPLETED',
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
});
