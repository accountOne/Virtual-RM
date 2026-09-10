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
  GuaranteeClaim,
  LcDiscrepancy,
  LetterOfCredit,
  Loan,
  Payable,
  PaymentOrder,
  Payroll,
  Product,
  Receivable,
  Recommendation,
  Task,
  TradeAmendment,
  TradeDocument,
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

// ---- Trade finance (Phase 6) ----------------------------------------------------------------

/** Sums amount/outstanding per currency — never converts, per spec §31/§46's "không tự quy đổi
 * FX nếu chưa có FX rate" (a real conversion would need get_fx_rate + an explicit calculation
 * step; this demo reports exposure the honest way, one line per currency, rather than guess). */
export interface ExposureByCurrency {
  currency: string;
  amount: number;
}

function sumByCurrency<T>(items: T[], currency: (item: T) => string, amount: (item: T) => number): ExposureByCurrency[] {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(currency(item), (totals.get(currency(item)) ?? 0) + amount(item));
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

export const getLcDeadlines = tool<Record<string, never>, LetterOfCredit[]>(
  'get_lc_deadlines',
  'Active LCs with their expiry/shipment/presentation dates, for deadline reasoning',
  (_ctx) => letterOfCreditsRepository.readAll().filter((l) => l.status === 'ACTIVE' || l.status === 'DOCUMENT_PENDING' || l.status === 'DISCREPANCY'),
);

export const getLcDocuments = tool<{ lcNumber?: string }, TradeDocument[]>(
  'get_lc_documents',
  'Document checklist for one LC (or the first active one needing attention if none named)',
  (_ctx, { lcNumber }) => {
    const items = letterOfCreditsRepository.readAll();
    const found = lcNumber
      ? items.find((l) => l.lcNumber === lcNumber)
      : items.find((l) => l.status === 'ACTIVE' && l.documents.some((d) => d.status !== 'ACCEPTED'));
    return found?.documents ?? [];
  },
);

export const getLcDiscrepancies = tool<{ lcNumber?: string }, (LcDiscrepancy & { lcNumber: string })[]>(
  'get_lc_discrepancies',
  'Discrepancies for one LC, or across all LCs if none named',
  (_ctx, { lcNumber }) => {
    const items = letterOfCreditsRepository.readAll();
    const scoped = lcNumber ? items.filter((l) => l.lcNumber === lcNumber) : items;
    return scoped.flatMap((l) => l.discrepancies.map((d) => ({ ...d, lcNumber: l.lcNumber })));
  },
);

export const getLcAmendments = tool<{ lcNumber?: string }, (TradeAmendment & { lcNumber: string })[]>(
  'get_lc_amendments',
  'Amendments for one LC, or across all LCs if none named',
  (_ctx, { lcNumber }) => {
    const items = letterOfCreditsRepository.readAll();
    const scoped = lcNumber ? items.filter((l) => l.lcNumber === lcNumber) : items;
    return scoped.flatMap((l) => l.amendments.map((a) => ({ ...a, lcNumber: l.lcNumber })));
  },
);

export const getLcExposure = tool<Record<string, never>, ExposureByCurrency[]>('get_lc_exposure', 'Outstanding LC exposure, summed per currency', (_ctx) =>
  sumByCurrency(
    letterOfCreditsRepository.readAll().filter((l) => l.status !== 'EXPIRED' && l.status !== 'CANCELLED' && l.status !== 'COMPLETED'),
    (l) => l.currency,
    (l) => l.outstandingAmount,
  ),
);

export const getGuaranteeDocuments = tool<{ bgNumber?: string }, TradeDocument[]>(
  'get_guarantee_documents',
  'Document checklist for one guarantee',
  (_ctx, { bgNumber }) => {
    const items = bankGuaranteesRepository.readAll();
    const found = bgNumber ? items.find((g) => g.bgNumber === bgNumber) : items.find((g) => g.status === 'ACTIVE');
    return found?.documents ?? [];
  },
);

export const getGuaranteeClaims = tool<{ bgNumber?: string }, (GuaranteeClaim & { bgNumber: string })[]>(
  'get_guarantee_claims',
  'Claims for one guarantee, or across all guarantees if none named',
  (_ctx, { bgNumber }) => {
    const items = bankGuaranteesRepository.readAll();
    const scoped = bgNumber ? items.filter((g) => g.bgNumber === bgNumber) : items;
    return scoped.flatMap((g) => g.claims.map((c) => ({ ...c, bgNumber: g.bgNumber })));
  },
);

export const getGuaranteeDeadlines = tool<Record<string, never>, BankGuarantee[]>(
  'get_guarantee_deadlines',
  'Active or claimed guarantees, for deadline/extension/claim reasoning',
  (_ctx) => bankGuaranteesRepository.readAll().filter((g) => g.status === 'ACTIVE' || g.status === 'CLAIMED'),
);

export const getGuaranteeExposure = tool<Record<string, never>, ExposureByCurrency[]>(
  'get_guarantee_exposure',
  'Outstanding guarantee exposure, summed per currency',
  (_ctx) =>
    sumByCurrency(
      bankGuaranteesRepository.readAll().filter((g) => g.status !== 'EXPIRED' && g.status !== 'CANCELLED'),
      (g) => g.currency,
      (g) => g.outstandingAmount,
    ),
);

export const getCollectionDocuments = tool<{ collectionNumber?: string }, TradeDocument[]>(
  'get_collection_documents',
  'Document checklist for one collection',
  (_ctx, { collectionNumber }) => {
    const items = collectionsRepository.readAll();
    const found = collectionNumber ? items.find((c) => c.collectionNumber === collectionNumber) : items[0];
    return found?.documents ?? [];
  },
);

export const getCollectionDeadlines = tool<Record<string, never>, Collection[]>(
  'get_collection_deadlines',
  'Collections not yet completed, with their due dates, for overdue/deadline reasoning',
  (_ctx) => collectionsRepository.readAll().filter((c) => c.status !== 'COMPLETED' && c.status !== 'CANCELLED'),
);

export const getCollectionExposure = tool<Record<string, never>, ExposureByCurrency[]>(
  'get_collection_exposure',
  'Open collection exposure, summed per currency',
  (_ctx) =>
    sumByCurrency(
      collectionsRepository.readAll().filter((c) => c.status !== 'COMPLETED' && c.status !== 'CANCELLED'),
      (c) => c.currency,
      (c) => c.amount,
    ),
);

export interface TradeFinanceExposure {
  lc: ExposureByCurrency[];
  guarantee: ExposureByCurrency[];
  collection: ExposureByCurrency[];
}

/** Composed once here (rather than the Reasoning Engine calling the 3 exposure tools above
 * separately) since "total Trade Finance exposure" is asked as one question often enough
 * (spec §31/§46) to be worth its own named tool — it still only reads repositories, it
 * doesn't call another tool's `execute`, keeping tools flat/non-composing. */
export const getTradeFinanceExposure = tool<Record<string, never>, TradeFinanceExposure>(
  'get_trade_finance_exposure',
  'LC + guarantee + collection exposure, each summed per currency',
  (_ctx) => ({
    lc: sumByCurrency(
      letterOfCreditsRepository.readAll().filter((l) => l.status !== 'EXPIRED' && l.status !== 'CANCELLED' && l.status !== 'COMPLETED'),
      (l) => l.currency,
      (l) => l.outstandingAmount,
    ),
    guarantee: sumByCurrency(
      bankGuaranteesRepository.readAll().filter((g) => g.status !== 'EXPIRED' && g.status !== 'CANCELLED'),
      (g) => g.currency,
      (g) => g.outstandingAmount,
    ),
    collection: sumByCurrency(
      collectionsRepository.readAll().filter((c) => c.status !== 'COMPLETED' && c.status !== 'CANCELLED'),
      (c) => c.currency,
      (c) => c.amount,
    ),
  }),
);

export const getTradeFinanceLimits = tool<Record<string, never>, CreditLimit | undefined>(
  'get_trade_finance_limits',
  'The TRADE_FINANCE credit limit record (total/used/available)',
  (_ctx) => creditLimitsRepository.readAll().find((c) => c.limitType === 'TRADE_FINANCE'),
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
  [getLcDeadlines.name]: getLcDeadlines,
  [getLcDocuments.name]: getLcDocuments,
  [getLcDiscrepancies.name]: getLcDiscrepancies,
  [getLcAmendments.name]: getLcAmendments,
  [getLcExposure.name]: getLcExposure,
  [getGuaranteeDocuments.name]: getGuaranteeDocuments,
  [getGuaranteeClaims.name]: getGuaranteeClaims,
  [getGuaranteeDeadlines.name]: getGuaranteeDeadlines,
  [getGuaranteeExposure.name]: getGuaranteeExposure,
  [getCollectionDocuments.name]: getCollectionDocuments,
  [getCollectionDeadlines.name]: getCollectionDeadlines,
  [getCollectionExposure.name]: getCollectionExposure,
  [getTradeFinanceExposure.name]: getTradeFinanceExposure,
  [getTradeFinanceLimits.name]: getTradeFinanceLimits,
  [getLoans.name]: getLoans,
  [getCreditLimits.name]: getCreditLimits,
  [getProducts.name]: getProducts,
  [getRecommendations.name]: getRecommendations,
  [getAlerts.name]: getAlerts,
  [getTasks.name]: getTasks,
};
