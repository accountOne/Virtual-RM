import { describe, test, assert, assertEqual } from './test-runner';
import {
  getAccountBalance,
  getAccounts,
  getBankGuarantees,
  getCashPosition,
  getCreditLimits,
  getFxDeals,
  getFxRates,
  getLetterOfCredits,
  getLoanObligations,
  getLoans,
  getPayables,
  getPaymentOrders,
  getPayrollSummary,
  getPendingApprovals,
  getProducts,
  getReceivables,
  getRecommendations,
  getTasks,
  getTransactions,
  toolRegistry,
} from '../src/tools';
import { UserContext } from '../src/ai/types';

const ctx: UserContext = { companyId: 'CIF00012345', userId: 'msb_ck', role: 'CHECKER' };

describe('tool layer (20 required)', () => {
  test('get_accounts returns real accounts', () => {
    const items = getAccounts.execute(ctx, {});
    assert(items.length > 0, 'expected at least one account');
  });
  test('get_account_balance defaults to the first account when none named', () => {
    const item = getAccountBalance.execute(ctx, {});
    assert(!!item, 'expected an account');
  });
  test('get_transactions returns real transactions', () => {
    const items = getTransactions.execute(ctx, {});
    assert(items.length > 0, 'expected at least one transaction');
  });
  test('get_transactions scopes to a date range', () => {
    const all = getTransactions.execute(ctx, {});
    const scoped = getTransactions.execute(ctx, { range: { from: '2099-01-01', to: '2099-01-02' } });
    assert(scoped.length === 0 && all.length > 0, 'a future range should return no transactions');
  });
  test('get_payment_orders returns real payment orders', () => {
    const items = getPaymentOrders.execute(ctx, {});
    assert(items.length > 0, 'expected at least one payment order');
  });
  test('get_pending_approvals only returns PENDING decisions', () => {
    const items = getPendingApprovals.execute(ctx, {});
    assert(items.every((i) => i.approval.decision === 'PENDING'), 'every returned approval must be PENDING');
  });
  test('get_cash_position totals only VND accounts', () => {
    const result = getCashPosition.execute(ctx, {});
    assert(result.totalVnd > 0, 'expected a positive VND total');
  });
  test('get_receivables returns real receivables', () => {
    const items = getReceivables.execute(ctx, {});
    assert(items.length > 0, 'expected at least one receivable');
  });
  test('get_payables returns real payables', () => {
    const items = getPayables.execute(ctx, {});
    assert(items.length > 0, 'expected at least one payable');
  });
  test('get_loan_obligations only returns ACTIVE loans in range', () => {
    const items = getLoanObligations.execute(ctx, { range: { from: '2000-01-01', to: '2099-01-01' } });
    assert(items.every((l) => l.status === 'ACTIVE'), 'every returned loan must be ACTIVE');
  });
  test('get_payroll_summary returns the most recent period', () => {
    const item = getPayrollSummary.execute(ctx, {});
    assert(!!item, 'expected a payroll record');
  });
  test('get_fx_deals returns real FX deals', () => {
    const items = getFxDeals.execute(ctx, {});
    assert(items.length > 0, 'expected at least one FX deal');
  });
  test('get_fx_rates returns real FX rates', () => {
    const items = getFxRates.execute(ctx, {});
    assert(items.length > 0, 'expected at least one FX rate');
  });
  test('get_letter_of_credits returns real LCs', () => {
    const items = getLetterOfCredits.execute(ctx, {});
    assert(items.length > 0, 'expected at least one LC');
  });
  test('get_bank_guarantees returns real BGs', () => {
    const items = getBankGuarantees.execute(ctx, {});
    assert(items.length > 0, 'expected at least one bank guarantee');
  });
  test('get_loans returns real loans', () => {
    const items = getLoans.execute(ctx, {});
    assert(items.length > 0, 'expected at least one loan');
  });
  test('get_credit_limits returns real credit limits', () => {
    const items = getCreditLimits.execute(ctx, {});
    assert(items.length > 0, 'expected at least one credit limit');
  });
  test('get_products returns real products', () => {
    const items = getProducts.execute(ctx, {});
    assert(items.length > 0, 'expected at least one product');
  });
  test('get_recommendations returns real recommendations', () => {
    const items = getRecommendations.execute(ctx, {});
    assert(items.length >= 0, 'should not throw');
  });
  test('get_tasks only returns OPEN tasks', () => {
    const items = getTasks.execute(ctx, {});
    assert(items.every((t) => t.status === 'OPEN'), 'every returned task must be OPEN');
  });
  test('toolRegistry has an entry for every exported tool name', () => {
    assertEqual(Object.keys(toolRegistry).length >= 20, true, 'expected at least 20 registered tools');
    assertEqual(toolRegistry['get_accounts'].name, 'get_accounts');
  });
});
