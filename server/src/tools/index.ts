// Business Tool Layer — Phase 5. Thin, named, security-scoped wrappers around the existing
// repositories (server/src/repositories) — this is *not* a new data-access layer, it's the
// boundary the Reasoning Engine calls through instead of reading repositories directly, so
// every reasoning step's data access is auditable and uniformly scoped to UserContext.
//
// Every tool takes the server-derived UserContext (never request input — see ai/types.ts) as
// its first argument. This demo's dataset is single-tenant (one seeded customer — see
// semantic-engine.ts::buildSecurityContext), so there is no per-row companyId column to filter
// by today; the boundary exists so that swapping in a real multi-tenant backend later only
// means adding a `.filter(r => r.companyId === ctx.companyId)` inside each tool body, not
// restructuring every call site.

import {
  accountsRepository,
  alertsRepository,
  approvalsRepository,
  bankGuaranteesRepository,
  collectionsRepository,
  creditLimitsRepository,
  fxDealsRepository,
  fxRatesRepository,
  letterOfCreditsRepository,
  loansRepository,
  payablesRepository,
  paymentOrdersRepository,
  payrollsRepository,
  productsRepository,
  receivablesRepository,
  recommendationsRepository,
  tasksRepository,
  transactionsRepository,
} from '../repositories';
import {
  Account,
  Alert,
  ApprovalRecord,
  BankGuarantee,
  Collection,
  CreditLimit,
  FxDeal,
  FxRate,
  LetterOfCredit,
  Loan,
  Payable,
  PaymentOrder,
  Payroll,
  Product,
  Receivable,
  Recommendation,
  Task,
  Transaction,
} from '../models';
import { DateRange } from '../semantic/types';
import { isWithinRange } from '../semantic/date-resolver';
import { UserContext } from '../ai/types';

export interface Tool<Params, Result> {
  name: string;
  description: string;
  execute: (ctx: UserContext, params: Params) => Result;
}

function tool<Params, Result>(name: string, description: string, execute: (ctx: UserContext, params: Params) => Result): Tool<Params, Result> {
  return { name, description, execute };
}

interface PeriodParams {
  range?: DateRange;
}

function scopeByRange<T>(items: T[], range: DateRange | undefined, pick: (item: T) => string): T[] {
  return range ? items.filter((item) => isWithinRange(pick(item), range)) : items;
}

// ---- Account ------------------------------------------------------------------------------

export const getAccounts = tool<Record<string, never>, Account[]>('get_accounts', 'List all company accounts', (_ctx) =>
  accountsRepository.readAll(),
);

export const getAccountBalance = tool<{ accountNo?: string }, Account | undefined>(
  'get_account_balance',
  'Balance of one account, or the first account if none named',
  (_ctx, { accountNo }) => {
    const accounts = accountsRepository.readAll();
    if (!accountNo) return accounts[0];
    return accounts.find((a) => a.accountNumber === accountNo || a.accountNumber.endsWith(accountNo));
  },
);

// ---- Transaction ----------------------------------------------------------------------------

export const getTransactions = tool<PeriodParams, Transaction[]>('get_transactions', 'Transactions, optionally within a date range', (_ctx, { range }) =>
  scopeByRange(transactionsRepository.readAll(), range, (t) => t.date),
);

// ---- Payment ------------------------------------------------------------------------------

export const getPaymentOrders = tool<PeriodParams & { status?: string }, PaymentOrder[]>(
  'get_payment_orders',
  'Payment orders, optionally filtered by status/date range',
  (_ctx, { range, status }) => {
    let items = paymentOrdersRepository.readAll();
    if (status) items = items.filter((p) => p.status === status);
    return scopeByRange(items, range, (p) => p.initiatedAt);
  },
);

// ---- Approval -----------------------------------------------------------------------------

/** Pending approvals for a payment order the CURRENT user (from UserContext) can act on —
 * mirrors query-builder.ts's existing rule that approverUserId is always the server-derived
 * userId, never client input. */
export const getPendingApprovals = tool<Record<string, never>, { approval: ApprovalRecord; order: PaymentOrder | undefined }[]>(
  'get_pending_approvals',
  "Approval records still PENDING for this user's role",
  (_ctx) => {
    const orders = paymentOrdersRepository.readAll();
    return approvalsRepository
      .readAll()
      .filter((a) => a.decision === 'PENDING')
      .map((a) => ({ approval: a, order: orders.find((o) => o.id === a.paymentOrderId) }));
  },
);

// ---- Cash management ------------------------------------------------------------------------

export const getCashPosition = tool<Record<string, never>, { totalVnd: number; accounts: Account[] }>(
  'get_cash_position',
  'Current overall liquidity position across VND accounts',
  (_ctx) => {
    const accounts = accountsRepository.readAll();
    const totalVnd = accounts.filter((a) => a.currency === 'VND').reduce((s, a) => s + a.balance, 0);
    return { totalVnd, accounts };
  },
);

export const getReceivables = tool<PeriodParams, Receivable[]>('get_receivables', 'Expected receivables, optionally within a date range', (_ctx, { range }) =>
  scopeByRange(receivablesRepository.readAll(), range, (r) => r.expectedDate),
);

export const getPayables = tool<PeriodParams, Payable[]>('get_payables', 'Scheduled payables, optionally within a date range', (_ctx, { range }) =>
  scopeByRange(payablesRepository.readAll(), range, (p) => p.dueDate),
);

/** Not in the spec's original tool list by name, but needed by LIQUIDITY_ANALYSIS (spec §12):
 * loan principal/interest coming due within a window, derived from loans.json's maturityDate —
 * this demo has no separate amortization schedule, so "obligation in the period" means the
 * loan matures within it. */
export const getLoanObligations = tool<PeriodParams, Loan[]>(
  'get_loan_obligations',
  'Active loans maturing within a date range',
  (_ctx, { range }) => {
    const active = loansRepository.readAll().filter((l) => l.status === 'ACTIVE');
    return scopeByRange(active, range, (l) => l.maturityDate);
  },
);

// ---- Payroll ------------------------------------------------------------------------------

export const getPayrollSummary = tool<Record<string, never>, Payroll | undefined>('get_payroll_summary', 'Most recent payroll period', (_ctx) => {
  const items = payrollsRepository.readAll().sort((a, b) => (a.period < b.period ? 1 : -1));
  return items[0];
});

// ---- FX -----------------------------------------------------------------------------------

export const getFxExposure = tool<PeriodParams, { buy: number; sell: number; deals: FxDeal[] }>(
  'get_fx_exposure',
  'Buy vs sell FX exposure within a date range',
  (_ctx, { range }) => {
    const deals = scopeByRange(fxDealsRepository.readAll(), range, (d) => d.date);
    const buy = deals.filter((d) => d.side === 'BUY').reduce((s, d) => s + d.vndEquivalent, 0);
    const sell = deals.filter((d) => d.side === 'SELL').reduce((s, d) => s + d.vndEquivalent, 0);
    return { buy, sell, deals };
  },
);

export const getFxDeals = tool<PeriodParams, FxDeal[]>('get_fx_deals', 'FX deals within a date range', (_ctx, { range }) =>
  scopeByRange(fxDealsRepository.readAll(), range, (d) => d.date),
);

export const getFxRates = tool<Record<string, never>, FxRate[]>('get_fx_rates', 'Today\'s reference FX rates', (_ctx) => fxRatesRepository.readAll());

// ---- Trade finance --------------------------------------------------------------------------

export const getLetterOfCredits = tool<Record<string, never>, LetterOfCredit[]>('get_letter_of_credits', 'All letters of credit', (_ctx) =>
  letterOfCreditsRepository.readAll(),
);

export const getBankGuarantees = tool<Record<string, never>, BankGuarantee[]>('get_bank_guarantees', 'All bank guarantees', (_ctx) =>
  bankGuaranteesRepository.readAll(),
);

export const getCollections = tool<Record<string, never>, Collection[]>('get_collections', 'All documentary collections', (_ctx) =>
  collectionsRepository.readAll(),
);

// ---- Lending ------------------------------------------------------------------------------

export const getLoans = tool<Record<string, never>, Loan[]>('get_loans', 'All loans', (_ctx) => loansRepository.readAll());

export const getCreditLimits = tool<Record<string, never>, CreditLimit[]>('get_credit_limits', 'All credit limits', (_ctx) => creditLimitsRepository.readAll());

// ---- Product ------------------------------------------------------------------------------

export const getProducts = tool<Record<string, never>, Product[]>('get_products', 'All bank products', (_ctx) => productsRepository.readAll());

export const getRecommendations = tool<Record<string, never>, Recommendation[]>('get_recommendations', 'Currently-eligible product recommendations', (_ctx) =>
  recommendationsRepository.readAll(),
);

// ---- Alert / Task ---------------------------------------------------------------------------

export const getAlerts = tool<Record<string, never>, Alert[]>('get_alerts', 'All open alerts', (_ctx) => alertsRepository.readAll());

export const getTasks = tool<Record<string, never>, Task[]>('get_tasks', 'All open tasks', (_ctx) => tasksRepository.readAll().filter((t) => t.status === 'OPEN'));

/** Registry keyed by tool name, used by the Reasoning Engine + SEMANTIC_DEBUG plan/toolsUsed
 * reporting (spec §23) so a plan can reference tools by string name. */
export const toolRegistry: Record<string, Tool<any, any>> = {
  [getAccounts.name]: getAccounts,
  [getAccountBalance.name]: getAccountBalance,
  [getTransactions.name]: getTransactions,
  [getPaymentOrders.name]: getPaymentOrders,
  [getPendingApprovals.name]: getPendingApprovals,
  [getCashPosition.name]: getCashPosition,
  [getReceivables.name]: getReceivables,
  [getPayables.name]: getPayables,
  [getLoanObligations.name]: getLoanObligations,
  [getPayrollSummary.name]: getPayrollSummary,
  [getFxExposure.name]: getFxExposure,
  [getFxDeals.name]: getFxDeals,
  [getFxRates.name]: getFxRates,
  [getLetterOfCredits.name]: getLetterOfCredits,
  [getBankGuarantees.name]: getBankGuarantees,
  [getCollections.name]: getCollections,
  [getLoans.name]: getLoans,
  [getCreditLimits.name]: getCreditLimits,
  [getProducts.name]: getProducts,
  [getRecommendations.name]: getRecommendations,
  [getAlerts.name]: getAlerts,
  [getTasks.name]: getTasks,
};
