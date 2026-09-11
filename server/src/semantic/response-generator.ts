import {
  accountsRepository,
  alertsRepository,
  approvalsRepository,
  bankGuaranteesRepository,
  collectionsRepository,
  creditLimitsRepository,
  customerRepository,
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
import { Account, Transaction } from '../models';
import { formatShortVnd, formatVnd } from '../utils/currency.util';
import { isWithinRange } from './date-resolver';
import * as agg from './aggregation-engine';
import { calculateGuaranteeRisk, calculateLcRisk, calculateLiquidityGap } from '../calculation/financial-calculations';
import { AmountFilter, AnswerAction, DateRange, MetricItem, NavigationActionDef, SemanticAnswer, SemanticQuery } from './types';

export interface GenerateContext {
  query: SemanticQuery;
  dateRange?: DateRange;
  anchorToday: string;
  navigationActions: NavigationActionDef[];
}

function fmt(n: number, currency = 'VND'): string {
  return currency === 'VND' ? formatVnd(n) : `${n.toLocaleString('vi-VN')} ${currency}`;
}

function matchesAmount(amount: number, filter?: AmountFilter): boolean {
  if (!filter) return true;
  switch (filter.operator) {
    case 'GT':
      return filter.value !== undefined && amount > filter.value;
    case 'GTE':
      return filter.value !== undefined && amount >= filter.value;
    case 'LT':
      return filter.value !== undefined && amount < filter.value;
    case 'LTE':
      return filter.value !== undefined && amount <= filter.value;
    case 'EQ':
      return filter.value !== undefined && amount === filter.value;
    case 'BETWEEN':
      return filter.min !== undefined && filter.max !== undefined && amount >= filter.min && amount <= filter.max;
    default:
      return true;
  }
}

function filterTransactions(query: SemanticQuery, dateRange?: DateRange): Transaction[] {
  let items = transactionsRepository.readAll();
  if (dateRange) items = items.filter((t) => isWithinRange(t.date, dateRange));
  if (query.filters.status) items = items.filter((t) => t.status === query.filters.status);
  if (query.filters.amount) items = items.filter((t) => matchesAmount(t.amount, query.filters.amount));
  if (query.entities.beneficiary) {
    const needle = query.entities.beneficiary.toLowerCase();
    items = items.filter((t) => t.counterparty.toLowerCase().includes(needle));
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** `entityId` (Phase 7) deep-links straight to one record's dedicated screen (e.g.
 * /trade-finance/lc/LC-2026-001) instead of the list — see types.ts::AnswerAction. */
function buildAction(navId: string, navigationActions: NavigationActionDef[], entityId?: string): AnswerAction | undefined {
  const nav = navigationActions.find((n) => n.id === navId);
  if (!nav) return undefined;
  return { label: nav.labelVi, type: 'NAVIGATE', target: nav.id, ...(entityId ? { entityId } : {}) };
}

function periodLabel(range?: DateRange): string {
  // Grammatically works both as a sentence-lead ("Thời gian gần đây: ...") and after
  // "trong" ("... trong thời gian gần đây") — the two call patterns used below.
  if (!range) return 'thời gian gần đây';
  // "khoảng thời gian từ X đến Y" (not bare "từ X đến Y") so this still reads correctly both
  // as a leading clause ("Khoảng thời gian từ X đến Y: ...") and after "trong" ("... trong
  // khoảng thời gian từ X đến Y") — "trong từ X đến Y" on its own is not grammatical Vietnamese.
  return range.from === range.to ? `ngày ${range.from}` : `khoảng thời gian từ ${range.from} đến ${range.to}`;
}

export function generateAnswer(ctx: GenerateContext): SemanticAnswer {
  const { query, navigationActions } = ctx;
  const genericAction = query.action ? buildAction(query.action, navigationActions) : undefined;
  const handler = HANDLERS[query.intent];
  if (!handler) return unknownAnswer(navigationActions);
  const result = handler(ctx);
  // A handler that names its own action/actions (Phase 7: a specific record's deep link, or
  // several) takes precedence over the intent's generic navigationAction; everything else
  // (the overwhelming majority of handlers) keeps falling back to the generic one unchanged.
  return { ...result, action: result.action ?? genericAction };
}

type Handler = (ctx: GenerateContext) => Omit<SemanticAnswer, 'action' | 'actions'> & Partial<Pick<SemanticAnswer, 'action' | 'actions'>>;

const HANDLERS: Record<string, Handler> = {
  // ---- ACCOUNT --------------------------------------------------------------
  ACCOUNT_LIST: () => {
    const accounts = accountsRepository.readAll();
    return {
      title: 'Tài khoản doanh nghiệp',
      summary: `Anh/chị hiện có ${accounts.length} tài khoản đang hoạt động.`,
      metrics: accounts.map((a) => ({ label: a.accountName, value: fmt(a.balance, a.currency) })),
      records: accounts,
    };
  },
  ACCOUNT_DETAIL: (ctx) => {
    const accounts = accountsRepository.readAll();
    const acc = findAccount(accounts, ctx.query.entities.accountNo) ?? accounts[0];
    if (!acc) return emptyAnswer('Chi tiết tài khoản', 'Không tìm thấy tài khoản phù hợp.');
    return {
      title: 'Chi tiết tài khoản',
      summary: `Tài khoản ${acc.accountName} (${acc.accountNumber}) — số dư ${fmt(acc.balance, acc.currency)}, khả dụng ${fmt(acc.availableBalance, acc.currency)}.`,
      metrics: [
        { label: 'Số dư', value: fmt(acc.balance, acc.currency) },
        { label: 'Khả dụng', value: fmt(acc.availableBalance, acc.currency) },
      ],
      records: [acc],
    };
  },
  ACCOUNT_BALANCE: (ctx) => {
    const accounts = accountsRepository.readAll();
    const acc = findAccount(accounts, ctx.query.entities.accountNo) ?? accounts[0];
    if (!acc) return emptyAnswer('Số dư tài khoản', 'Không tìm thấy tài khoản phù hợp.');
    return {
      title: 'Số dư tài khoản',
      summary: `Số dư tài khoản ${acc.accountName} hiện tại là ${fmt(acc.balance, acc.currency)}.`,
      metrics: [{ label: 'Số dư', value: fmt(acc.balance, acc.currency) }],
      records: [acc],
    };
  },
  ACCOUNT_AVAILABLE_BALANCE: (ctx) => {
    const accounts = accountsRepository.readAll();
    const acc = findAccount(accounts, ctx.query.entities.accountNo) ?? accounts[0];
    if (!acc) return emptyAnswer('Số dư khả dụng', 'Không tìm thấy tài khoản phù hợp.');
    return {
      title: 'Số dư khả dụng',
      summary: `Số dư khả dụng tài khoản ${acc.accountName} là ${fmt(acc.availableBalance, acc.currency)}.`,
      metrics: [{ label: 'Khả dụng', value: fmt(acc.availableBalance, acc.currency) }],
      records: [acc],
    };
  },
  // Phase 5 multi-turn example (spec §17): "Tài khoản nào nhiều tiền nhất?" then "Còn tài
  // khoản USD?" — conversation-context.ts replays the ACCOUNT_HIGHEST_BALANCE intent with a
  // currency filter carried over from context, so this needs to actually respect
  // filters.currency now (it's additive — no currency filter behaves exactly as before).
  ACCOUNT_HIGHEST_BALANCE: (ctx) => {
    const currency = ctx.query.filters.currency;
    const accounts = accountsRepository.readAll().filter((a) => !currency || a.currency === currency);
    const top = agg.max(accounts, (a) => a.balance);
    if (!top) {
      return emptyAnswer(
        'Tài khoản số dư lớn nhất',
        currency ? `Doanh nghiệp chưa có tài khoản ${currency} nào.` : 'Doanh nghiệp chưa có tài khoản nào.',
      );
    }
    return {
      title: 'Tài khoản số dư lớn nhất',
      summary: `Tài khoản ${top.accountName} đang có số dư lớn nhất${currency ? ` (${currency})` : ''} — ${fmt(top.balance, top.currency)}.`,
      metrics: [{ label: top.accountName, value: fmt(top.balance, top.currency) }],
      records: [top],
    };
  },
  ACCOUNT_LOWEST_BALANCE: (ctx) => {
    const currency = ctx.query.filters.currency;
    const accounts = accountsRepository.readAll().filter((a) => !currency || a.currency === currency);
    const bottom = agg.min(accounts, (a) => a.balance);
    if (!bottom) return emptyAnswer('Tài khoản số dư thấp nhất', 'Doanh nghiệp chưa có tài khoản nào.');
    return {
      title: 'Tài khoản số dư thấp nhất',
      summary: `Tài khoản ${bottom.accountName} đang có số dư thấp nhất — ${fmt(bottom.balance, bottom.currency)}.`,
      metrics: [{ label: bottom.accountName, value: fmt(bottom.balance, bottom.currency) }],
      records: [bottom],
    };
  },
  ACCOUNT_STATEMENT: (ctx) => {
    const accounts = accountsRepository.readAll();
    const acc = findAccount(accounts, ctx.query.entities.accountNo) ?? accounts[0];
    const all = transactionsRepository.readAll().filter((t) => (acc ? t.accountId === acc.id : true));
    const items = ctx.dateRange ? all.filter((t) => isWithinRange(t.date, ctx.dateRange!)) : all;
    return {
      title: 'Sao kê giao dịch',
      summary: `${items.length} giao dịch trên tài khoản ${acc?.accountName ?? ''} trong ${periodLabel(ctx.dateRange)}.`,
      metrics: [{ label: 'Số giao dịch', value: String(items.length) }],
      records: items.slice(0, 20),
    };
  },

  // ---- TRANSACTION ------------------------------------------------------------
  TRANSACTION_LIST: (ctx) => {
    const items = filterTransactions(ctx.query, ctx.dateRange);
    return {
      title: 'Giao dịch gần đây',
      summary: `${items.length} giao dịch gần nhất, tổng giá trị ${fmt(agg.sum(items, (t) => t.amount))}.`,
      metrics: [{ label: 'Số giao dịch', value: String(items.length) }],
      records: items.slice(0, 10),
    };
  },
  TRANSACTION_DETAIL: (ctx) => {
    const items = transactionsRepository.readAll();
    const found = items.find((t) => t.id === ctx.query.entities.documentId) ?? items[0];
    if (!found) return emptyAnswer('Chi tiết giao dịch', 'Không tìm thấy giao dịch phù hợp.');
    return {
      title: 'Chi tiết giao dịch',
      summary: `${found.description} — ${fmt(found.amount, found.currency)} với ${found.counterparty}.`,
      metrics: [{ label: 'Số tiền', value: fmt(found.amount, found.currency) }],
      records: [found],
    };
  },
  TRANSACTION_SUMMARY: (ctx) => {
    const items = filterTransactions(ctx.query, ctx.dateRange);
    return {
      title: 'Tổng hợp giao dịch',
      summary: `${items.length} giao dịch trong ${periodLabel(ctx.dateRange)}, tổng giá trị ${fmt(agg.sum(items, (t) => t.amount))}.`,
      metrics: [
        { label: 'Số giao dịch', value: String(items.length) },
        { label: 'Tổng giá trị', value: fmt(agg.sum(items, (t) => t.amount)) },
      ],
      records: items.slice(0, 10),
    };
  },
  TRANSACTION_LARGEST: (ctx) => {
    const items = filterTransactions(ctx.query, ctx.dateRange);
    const largest = agg.max(items, (t) => t.amount);
    if (!largest) return emptyAnswer('Giao dịch lớn nhất', `Không có giao dịch nào trong ${periodLabel(ctx.dateRange)}.`);
    return {
      title: 'Giao dịch lớn nhất',
      summary: `Giao dịch lớn nhất trong ${periodLabel(ctx.dateRange)}: ${fmt(largest.amount, largest.currency)} — ${largest.counterparty}.`,
      metrics: [{ label: 'Giá trị lớn nhất', value: fmt(largest.amount, largest.currency) }],
      records: [largest],
    };
  },
  TRANSACTION_BY_AMOUNT: (ctx) => {
    const items = filterTransactions(ctx.query, ctx.dateRange);
    return {
      title: 'Giao dịch theo số tiền',
      summary: `${items.length} giao dịch thỏa điều kiện, tổng giá trị ${fmt(agg.sum(items, (t) => t.amount))}.`,
      metrics: [{ label: 'Số giao dịch', value: String(items.length) }],
      records: items.slice(0, 10),
    };
  },
  TRANSACTION_BY_DATE: (ctx) => {
    const items = filterTransactions(ctx.query, ctx.dateRange);
    return {
      title: 'Giao dịch theo thời gian',
      summary: `${items.length} giao dịch trong ${periodLabel(ctx.dateRange)}.`,
      metrics: [{ label: 'Số giao dịch', value: String(items.length) }],
      records: items.slice(0, 10),
    };
  },
  TRANSACTION_BY_BENEFICIARY: (ctx) => {
    const items = filterTransactions(ctx.query, ctx.dateRange);
    const who = ctx.query.entities.beneficiary ?? 'đối tác này';
    return {
      title: 'Giao dịch theo đối tác',
      summary: `${items.length} giao dịch với ${who}, tổng giá trị ${fmt(agg.sum(items, (t) => t.amount))}.`,
      metrics: [{ label: 'Tổng giá trị', value: fmt(agg.sum(items, (t) => t.amount)) }],
      records: items.slice(0, 10),
    };
  },
  TRANSACTION_FAILED: (ctx) => {
    const all = transactionsRepository.readAll().filter((t) => t.status === 'REJECTED');
    const items = ctx.dateRange ? all.filter((t) => isWithinRange(t.date, ctx.dateRange!)) : all;
    return {
      title: 'Giao dịch thất bại/từ chối',
      summary: `${items.length} giao dịch bị từ chối hoặc thất bại trong ${periodLabel(ctx.dateRange)}.`,
      metrics: [{ label: 'Số giao dịch', value: String(items.length) }],
      records: items,
    };
  },

  // ---- PAYMENT -----------------------------------------------------------------
  PAYMENT_STATUS: (ctx) => {
    const orders = paymentOrdersRepository.readAll();
    const found = orders.find((o) => o.id === ctx.query.entities.documentId) ?? orders[0];
    if (!found) return emptyAnswer('Trạng thái lệnh thanh toán', 'Không tìm thấy lệnh thanh toán phù hợp.');
    return {
      title: 'Trạng thái lệnh thanh toán',
      summary: `Lệnh "${found.description}" đang ở trạng thái ${found.status}.`,
      metrics: [{ label: 'Trạng thái', value: found.status }],
      records: [found],
    };
  },
  PAYMENT_TODAY: () => {
    const todayItems = paymentOrdersRepository.readAll();
    return {
      title: 'Lệnh thanh toán hôm nay',
      summary: `${todayItems.length} lệnh thanh toán được lập gần đây, tổng giá trị ${fmt(agg.sum(todayItems, (o) => o.amount))}.`,
      metrics: [{ label: 'Số lệnh', value: String(todayItems.length) }],
      records: todayItems,
    };
  },
  PAYMENT_PENDING: () => {
    const items = paymentOrdersRepository.readAll().filter((o) => o.status === 'PENDING_APPROVAL');
    return {
      title: 'Lệnh thanh toán đang chờ',
      summary: `${items.length} lệnh thanh toán đang chờ xử lý.`,
      metrics: [{ label: 'Số lệnh', value: String(items.length) }],
      records: items,
    };
  },
  PAYMENT_FAILED: () => {
    const items = paymentOrdersRepository.readAll().filter((o) => o.status === 'FAILED');
    return {
      title: 'Lệnh thanh toán lỗi',
      summary: `${items.length} lệnh thanh toán bị lỗi.`,
      metrics: [{ label: 'Số lệnh', value: String(items.length) }],
      records: items,
    };
  },
  PAYMENT_CREATE: () => ({
    title: 'Lập lệnh chuyển tiền',
    summary: 'Anh/chị có thể lập lệnh chuyển tiền ngay tại đây — chọn tài khoản nguồn, nhập người thụ hưởng và số tiền là xong.',
    metrics: [],
    records: [],
  }),

  // ---- APPROVAL ----------------------------------------------------------------
  APPROVAL_PENDING: (ctx) => {
    let items = transactionsRepository.readAll().filter((t) => t.status === 'PENDING_APPROVAL');
    if (ctx.query.filters.amount) items = items.filter((t) => matchesAmount(t.amount, ctx.query.filters.amount));
    const total = agg.sum(items, (t) => t.amount);
    if (items.length === 0) return emptyAnswer('Giao dịch chờ duyệt', 'Hiện không có giao dịch nào đang chờ phê duyệt.');
    const largest = agg.max(items, (t) => t.amount)!;
    return {
      title: 'Giao dịch chờ duyệt',
      summary: `Anh/chị đang có ${items.length} giao dịch cần duyệt, tổng giá trị ${fmt(total)}. Lớn nhất: ${fmt(largest.amount, largest.currency)} — ${largest.counterparty}.`,
      metrics: [
        { label: 'Số giao dịch', value: String(items.length) },
        { label: 'Tổng giá trị', value: fmt(total) },
        { label: 'Lớn nhất', value: `${fmt(largest.amount, largest.currency)} — ${largest.counterparty}` },
      ],
      records: items,
    };
  },
  APPROVAL_DETAIL: (ctx) => {
    const orders = paymentOrdersRepository.readAll();
    const found =
      orders.find((o) => o.id === ctx.query.entities.documentId) ??
      orders.find((o) => ctx.query.entities.beneficiary && o.beneficiary.toLowerCase().includes(ctx.query.entities.beneficiary.toLowerCase())) ??
      orders.find((o) => o.status === 'PENDING_APPROVAL');
    if (!found) return emptyAnswer('Chi tiết lệnh chờ duyệt', 'Không tìm thấy lệnh chờ duyệt phù hợp.');
    return {
      title: 'Chi tiết lệnh chờ duyệt',
      summary: `${found.description} — ${fmt(found.amount, found.currency)}, người thụ hưởng ${found.beneficiary}.`,
      metrics: [{ label: 'Số tiền', value: fmt(found.amount, found.currency) }],
      records: [found],
    };
  },
  APPROVAL_APPROVE: () => ({
    title: 'Phê duyệt giao dịch',
    summary: 'Mở màn hình phê duyệt để anh/chị xác nhận giao dịch.',
    metrics: [],
    records: [],
  }),
  APPROVAL_REJECT: () => ({
    title: 'Từ chối giao dịch',
    summary: 'Mở màn hình phê duyệt để anh/chị từ chối giao dịch.',
    metrics: [],
    records: [],
  }),

  // ---- TASK / ALERT --------------------------------------------------------------
  TASK_LIST: () => {
    const items = tasksRepository.readAll().filter((t) => t.status === 'OPEN');
    return {
      title: 'Việc cần xử lý',
      summary: `Anh/chị còn ${items.length} việc cần xử lý.`,
      metrics: [{ label: 'Số việc', value: String(items.length) }],
      records: items,
    };
  },
  TASK_DUE: (ctx) => {
    const open = tasksRepository.readAll().filter((t) => t.status === 'OPEN');
    const items = ctx.dateRange ? open.filter((t) => isWithinRange(t.dueDate, ctx.dateRange!)) : open;
    const sorted = [...items].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    return {
      title: 'Việc sắp đến hạn',
      summary: `${sorted.length} việc sắp đến hạn hoặc đã quá hạn.${sorted[0] ? ` Gần nhất: "${sorted[0].title}" — hạn ${sorted[0].dueDate}.` : ''}`,
      metrics: [{ label: 'Số việc', value: String(sorted.length) }],
      records: sorted,
    };
  },
  ALERT_LIST: () => {
    const items = alertsRepository.readAll();
    return {
      title: 'Cảnh báo hiện có',
      summary: `Anh/chị có ${items.length} cảnh báo cần chú ý.`,
      metrics: [{ label: 'Số cảnh báo', value: String(items.length) }],
      records: items,
    };
  },
  ALERT_HIGH_PRIORITY: () => {
    const items = alertsRepository.readAll().filter((a) => a.severity === 'CRITICAL');
    return {
      title: 'Cảnh báo ưu tiên cao',
      summary: `${items.length} cảnh báo mức độ nghiêm trọng cao cần xử lý ngay.`,
      metrics: [{ label: 'Số cảnh báo', value: String(items.length) }],
      records: items,
    };
  },

  // ---- CASH MANAGEMENT ---------------------------------------------------------
  INCOMING_PAYMENT: (ctx) => {
    const all = transactionsRepository.readAll().filter((t) => t.type === 'CREDIT');
    const items = ctx.dateRange ? all.filter((t) => isWithinRange(t.date, ctx.dateRange!)) : all;
    const total = agg.sum(items, (t) => t.amount);
    return {
      title: 'Tiền vào',
      summary: `Tiền vào ${periodLabel(ctx.dateRange)}: ${fmt(total)} từ ${items.length} giao dịch.`,
      metrics: [{ label: 'Tổng tiền vào', value: fmt(total) }],
      records: items.slice(0, 10),
    };
  },
  OUTGOING_PAYMENT: (ctx) => {
    const all = transactionsRepository.readAll().filter((t) => t.type === 'DEBIT');
    const items = ctx.dateRange ? all.filter((t) => isWithinRange(t.date, ctx.dateRange!)) : all;
    const total = agg.sum(items, (t) => t.amount);
    return {
      title: 'Tiền ra',
      summary: `Tiền ra ${periodLabel(ctx.dateRange)}: ${fmt(total)} từ ${items.length} giao dịch.`,
      metrics: [{ label: 'Tổng tiền ra', value: fmt(total) }],
      records: items.slice(0, 10),
    };
  },
  CASH_POSITION: () => {
    const accounts = accountsRepository.readAll();
    const total = accounts.filter((a) => a.currency === 'VND').reduce((s, a) => s + a.balance, 0);
    return {
      title: 'Vị thế thanh khoản',
      summary: `Tổng thanh khoản hiện tại: ${fmt(total)} trên ${accounts.length} tài khoản.`,
      metrics: [{ label: 'Tổng thanh khoản (VND)', value: fmt(total) }],
      records: accounts,
    };
  },
  CASH_FLOW_SUMMARY: (ctx) => {
    const all = transactionsRepository.readAll();
    const items = ctx.dateRange ? all.filter((t) => isWithinRange(t.date, ctx.dateRange!)) : all;
    const incoming = agg.sum(items.filter((t) => t.type === 'CREDIT'), (t) => t.amount);
    const outgoing = agg.sum(items.filter((t) => t.type === 'DEBIT'), (t) => t.amount);
    return {
      title: 'Dòng tiền',
      summary: `${periodLabel(ctx.dateRange)}: tiền vào ${fmt(incoming)}, tiền ra ${fmt(outgoing)}.`,
      metrics: [
        { label: 'Tiền vào', value: fmt(incoming) },
        { label: 'Tiền ra', value: fmt(outgoing) },
      ],
      records: items.slice(0, 10),
    };
  },
  CASH_FLOW_COMPARE: (ctx) => {
    const all = transactionsRepository.readAll().filter((t) => t.type === 'DEBIT');
    const current = ctx.dateRange ? all.filter((t) => isWithinRange(t.date, ctx.dateRange!)) : all;
    const currentTotal = agg.sum(current, (t) => t.amount);
    const prevRange = previousPeriod(ctx.dateRange, ctx.anchorToday);
    const previous = prevRange ? all.filter((t) => isWithinRange(t.date, prevRange)) : [];
    const previousTotal = agg.sum(previous, (t) => t.amount);
    const cmp = agg.compare(currentTotal, previousTotal);
    return {
      title: 'So sánh dòng tiền',
      summary: `${periodLabel(ctx.dateRange)} chi ${fmt(cmp.current)}, ${cmp.trend} ${Math.abs(cmp.pctChange)}% so với kỳ trước (${fmt(cmp.previous)}).`,
      metrics: [
        { label: 'Kỳ này', value: fmt(cmp.current) },
        { label: 'Kỳ trước', value: fmt(cmp.previous) },
        { label: 'Thay đổi', value: `${cmp.trend} ${Math.abs(cmp.pctChange)}%` },
      ],
      records: [],
    };
  },

  // ---- PAYROLL --------------------------------------------------------------------
  PAYROLL_SUMMARY: () => {
    const items = payrollsRepository.readAll().sort((a, b) => (a.period < b.period ? 1 : -1));
    const latest = items[0];
    if (!latest) return emptyAnswer('Kỳ trả lương', 'Chưa có dữ liệu trả lương.');
    return {
      title: 'Kỳ trả lương',
      summary: `Kỳ lương ${latest.period}: ${latest.employeeCount} nhân viên, tổng chi ${fmt(latest.totalAmount)} — trạng thái ${latest.status}.`,
      metrics: [
        { label: 'Số nhân viên', value: String(latest.employeeCount) },
        { label: 'Tổng chi lương', value: fmt(latest.totalAmount) },
      ],
      records: items,
    };
  },

  // ---- FX -----------------------------------------------------------------------
  FX_RATE: (ctx) => {
    const rates = fxRatesRepository.readAll();
    const wanted = ctx.query.filters.currency ?? 'USD';
    const rate = rates.find((r) => r.currency === wanted) ?? rates[0];
    if (!rate) return emptyAnswer('Tỷ giá tham khảo', 'Chưa có dữ liệu tỷ giá.');
    return {
      title: 'Tỷ giá tham khảo',
      summary: `Tỷ giá ${rate.currency} hôm nay: mua ${rate.buy.toLocaleString('vi-VN')} / bán ${rate.sell.toLocaleString('vi-VN')} VNĐ.`,
      metrics: rates.map((r) => ({ label: r.currency, value: `${r.buy.toLocaleString('vi-VN')} / ${r.sell.toLocaleString('vi-VN')}` })),
      records: rates,
    };
  },
  FX_DEALS: (ctx) => {
    const all = fxDealsRepository.readAll();
    const items = ctx.dateRange ? all.filter((d) => isWithinRange(d.date, ctx.dateRange!)) : all;
    const total = agg.sum(items, (d) => d.vndEquivalent);
    return {
      title: 'Giao dịch ngoại tệ',
      summary: `${items.length} giao dịch ngoại tệ trong ${periodLabel(ctx.dateRange)}, tổng giá trị ${fmt(total)}.`,
      metrics: [{ label: 'Số giao dịch', value: String(items.length) }],
      records: items,
    };
  },
  FX_EXPOSURE: (ctx) => {
    const all = fxDealsRepository.readAll();
    const items = ctx.dateRange ? all.filter((d) => isWithinRange(d.date, ctx.dateRange!)) : all;
    const buy = agg.sum(items.filter((d) => d.side === 'BUY'), (d) => d.vndEquivalent);
    const sell = agg.sum(items.filter((d) => d.side === 'SELL'), (d) => d.vndEquivalent);
    const dominant = buy >= sell ? 'mua' : 'bán';
    return {
      title: 'Trạng thái ngoại tệ',
      summary: `${periodLabel(ctx.dateRange)}: doanh nghiệp ${dominant} ngoại tệ nhiều hơn — mua ${fmt(buy)}, bán ${fmt(sell)}.`,
      metrics: [
        { label: 'Mua vào', value: fmt(buy) },
        { label: 'Bán ra', value: fmt(sell) },
      ],
      records: items,
    };
  },

  // ---- TRADE FINANCE --------------------------------------------------------------
  LC_LIST: () => {
    const items = letterOfCreditsRepository.readAll();
    return {
      title: 'Thư tín dụng',
      summary: `Doanh nghiệp hiện có ${items.length} thư tín dụng.`,
      metrics: [{ label: 'Số LC', value: String(items.length) }],
      records: items,
    };
  },
  LC_STATUS: (ctx) => {
    const items = letterOfCreditsRepository.readAll();
    const found = items.find((l) => l.lcNumber === ctx.query.entities.documentId) ?? items[0];
    if (!found) return emptyAnswer('Trạng thái LC', 'Không tìm thấy thư tín dụng phù hợp.');
    return {
      title: 'Trạng thái LC',
      summary: `${found.lcNumber} đang ở trạng thái ${found.status}, hết hạn ${found.expiryDate}.`,
      metrics: [{ label: 'Trạng thái', value: found.status }],
      records: [found],
      action: buildAction('OPEN_LC_DETAIL', ctx.navigationActions, found.lcNumber),
    };
  },
  // Phase 7: one CTA per highlighted LC (straight to its dedicated screen) plus a "view all"
  // CTA — the exact shape the Trade Finance screens spec's own worked examples show.
  LC_EXPIRY: (ctx) => {
    const range = ctx.dateRange ?? { from: ctx.anchorToday, to: addDaysLocal(ctx.anchorToday, 30) };
    const items = letterOfCreditsRepository.readAll().filter((l) => l.status === 'ACTIVE' && isWithinRange(l.expiryDate, range));
    const perLc = items
      .slice(0, 3)
      .map((l) => buildAction('OPEN_LC_DETAIL', ctx.navigationActions, l.lcNumber))
      .filter((a): a is AnswerAction => !!a)
      .map((a, i) => ({ ...a, label: `Xem ${items[i].lcNumber}` }));
    const viewAll = buildAction('OPEN_LC', ctx.navigationActions);
    return {
      title: 'LC sắp hết hạn',
      summary: `${items.length} thư tín dụng sắp hết hạn trong ${periodLabel(range)}.`,
      metrics: [{ label: 'Số LC sắp hết hạn', value: String(items.length) }],
      records: items,
      actions: viewAll ? [...perLc, { ...viewAll, label: 'Xem tất cả LC' }] : perLc,
    };
  },
  LC_DETAIL: (ctx) => {
    const items = letterOfCreditsRepository.readAll();
    const found = items.find((l) => l.lcNumber === ctx.query.entities.documentId) ?? items[0];
    if (!found) return emptyAnswer('Chi tiết LC', 'Không tìm thấy thư tín dụng phù hợp.');
    return {
      title: 'Chi tiết LC',
      summary: `${found.lcNumber} — giá trị ${fmt(found.amount, found.currency)}, hết hạn ${found.expiryDate}.`,
      metrics: [{ label: 'Giá trị', value: fmt(found.amount, found.currency) }],
      records: [found],
      action: buildAction('OPEN_LC_DETAIL', ctx.navigationActions, found.lcNumber),
    };
  },
  GUARANTEE_LIST: (ctx) => {
    const items = bankGuaranteesRepository.readAll();
    const docId = ctx.query.entities.documentId;
    if (docId) {
      const found = items.find((g) => g.bgNumber === docId);
      if (!found) return emptyAnswer('Chi tiết bảo lãnh', 'Không tìm thấy bảo lãnh phù hợp.');
      return {
        title: 'Chi tiết bảo lãnh',
        summary: `${found.bgNumber} — giá trị ${fmt(found.amount, found.currency)}, trạng thái ${found.status}, hết hạn ${found.expiryDate}.`,
        metrics: [{ label: 'Giá trị', value: fmt(found.amount, found.currency) }],
        records: [found],
        action: buildAction('OPEN_GUARANTEE_DETAIL', ctx.navigationActions, found.bgNumber),
      };
    }
    return {
      title: 'Bảo lãnh ngân hàng',
      summary: `Doanh nghiệp hiện có ${items.length} bảo lãnh ngân hàng.`,
      metrics: [{ label: 'Số bảo lãnh', value: String(items.length) }],
      records: items,
    };
  },
  GUARANTEE_EXPIRY: (ctx) => {
    const range = ctx.dateRange ?? { from: ctx.anchorToday, to: addDaysLocal(ctx.anchorToday, 30) };
    const items = bankGuaranteesRepository.readAll().filter((g) => g.status === 'ACTIVE' && isWithinRange(g.expiryDate, range));
    const perBg = items
      .slice(0, 3)
      .map((g) => buildAction('OPEN_GUARANTEE_DETAIL', ctx.navigationActions, g.bgNumber))
      .filter((a): a is AnswerAction => !!a)
      .map((a, i) => ({ ...a, label: `Xem ${items[i].bgNumber}` }));
    const viewAll = buildAction('OPEN_GUARANTEE', ctx.navigationActions);
    return {
      title: 'Bảo lãnh sắp đáo hạn',
      summary: `${items.length} bảo lãnh sắp đáo hạn trong ${periodLabel(range)}.`,
      metrics: [{ label: 'Số bảo lãnh', value: String(items.length) }],
      records: items,
      actions: viewAll ? [...perBg, { ...viewAll, label: 'Xem tất cả bảo lãnh' }] : perBg,
    };
  },
  COLLECTION_LIST: () => {
    const items = collectionsRepository.readAll();
    return {
      title: 'Nhờ thu',
      summary: `Doanh nghiệp hiện có ${items.length} bộ chứng từ nhờ thu.`,
      metrics: [{ label: 'Số bộ chứng từ', value: String(items.length) }],
      records: items,
    };
  },

  // ---- TRADE FINANCE (Phase 6) --------------------------------------------------------
  LC_DOCUMENT_STATUS: (ctx) => {
    const items = letterOfCreditsRepository.readAll();
    const found =
      items.find((l) => l.lcNumber === ctx.query.entities.documentId) ??
      items.find((l) => l.status === 'ACTIVE' && l.documents.some((d) => d.status !== 'ACCEPTED')) ??
      items[0];
    if (!found) return emptyAnswer('Checklist chứng từ LC', 'Không tìm thấy thư tín dụng phù hợp.');
    const missing = found.documents.filter((d) => d.status === 'MISSING');
    const pending = found.documents.filter((d) => d.status === 'PENDING' || d.status === 'DISCREPANT');
    const receivedCount = found.documents.filter((d) => d.received).length;
    const metrics: MetricItem[] = [{ label: 'Đã nhận', value: `${receivedCount}/${found.documents.length}` }];
    if (missing.length) metrics.push({ label: 'Thiếu', value: missing.map((d) => d.documentType).join(', ') });
    if (pending.length) metrics.push({ label: 'Đang chờ / sai biệt', value: pending.map((d) => d.documentType).join(', ') });
    return {
      title: 'Checklist chứng từ LC',
      summary:
        missing.length === 0 && pending.length === 0
          ? `${found.lcNumber} đã đủ chứng từ (${found.documents.length}/${found.documents.length}).`
          : `Hồ sơ ${found.lcNumber} chưa đầy đủ — thiếu ${missing.length}, đang chờ/sai biệt ${pending.length}.`,
      metrics,
      records: found.documents,
      action: buildAction('OPEN_LC_DOCUMENTS', ctx.navigationActions, found.lcNumber),
    };
  },
  LC_DISCREPANCY: (ctx) => {
    const items = letterOfCreditsRepository.readAll();
    const found =
      items.find((l) => l.lcNumber === ctx.query.entities.documentId) ??
      items.find((l) => l.discrepancies.length > 0) ??
      items[0];
    if (!found) return emptyAnswer('Sai biệt LC', 'Không tìm thấy thư tín dụng phù hợp.');
    const open = found.discrepancies.filter((d) => d.status === 'OPEN');
    return {
      title: 'Sai biệt LC',
      summary:
        found.discrepancies.length === 0
          ? `${found.lcNumber} hiện không có sai biệt nào.`
          : `${found.lcNumber} có ${found.discrepancies.length} sai biệt, ${open.length} đang mở.`,
      metrics: [{ label: 'Số sai biệt', value: String(found.discrepancies.length) }],
      records: found.discrepancies,
      action: buildAction('OPEN_LC_DISCREPANCY', ctx.navigationActions, found.lcNumber),
    };
  },
  LC_AMENDMENT: (ctx) => {
    const items = letterOfCreditsRepository.readAll();
    const docId = ctx.query.entities.documentId;
    if (docId) {
      const found = items.find((l) => l.lcNumber === docId);
      if (!found) return emptyAnswer('Tu chỉnh LC', 'Không tìm thấy thư tín dụng phù hợp.');
      return {
        title: 'Tu chỉnh LC',
        summary: found.amendments.length === 0 ? `${found.lcNumber} hiện không có amendment nào.` : `${found.lcNumber} có ${found.amendments.length} amendment.`,
        metrics: [{ label: 'Số amendment', value: String(found.amendments.length) }],
        records: found.amendments,
        action: buildAction('OPEN_LC_AMENDMENT', ctx.navigationActions, found.lcNumber),
      };
    }
    const pending = items.flatMap((l) => l.amendments.filter((a) => a.status === 'PENDING').map((a) => ({ ...a, lcNumber: l.lcNumber })));
    return {
      title: 'Tu chỉnh LC đang chờ',
      summary: pending.length === 0 ? 'Hiện không có amendment nào đang chờ xử lý.' : `${pending.length} amendment đang chờ xử lý.`,
      metrics: [{ label: 'Đang chờ', value: String(pending.length) }],
      records: pending,
    };
  },
  // Human-in-the-loop (spec §38/§39): prepares a checklist and relies on navigationAction
  // (OPEN_LC) to hand off — never creates, amends, or issues anything itself.
  LC_REQUEST: () => ({
    title: 'Yêu cầu mở / sửa đổi / gia hạn LC',
    summary:
      'Thông thường cần chuẩn bị: đề nghị phát hành/sửa đổi LC, hợp đồng ngoại thương, thông tin beneficiary, điều khoản LC, chứng từ liên quan, hồ sơ theo yêu cầu ngân hàng.',
    metrics: [],
    records: [],
  }),
  GUARANTEE_CLAIM: (ctx) => {
    const items = bankGuaranteesRepository.readAll();
    const docId = ctx.query.entities.documentId;
    if (docId) {
      const found = items.find((g) => g.bgNumber === docId);
      if (!found) return emptyAnswer('Yêu cầu gọi bảo lãnh', 'Không tìm thấy bảo lãnh phù hợp.');
      return {
        title: 'Yêu cầu gọi bảo lãnh',
        summary: found.claims.length === 0 ? `${found.bgNumber} hiện không có yêu cầu gọi bảo lãnh nào.` : `${found.bgNumber} có ${found.claims.length} yêu cầu gọi bảo lãnh.`,
        metrics: [{ label: 'Số claim', value: String(found.claims.length) }],
        records: found.claims,
        action: buildAction('OPEN_GUARANTEE_CLAIM', ctx.navigationActions, found.bgNumber),
      };
    }
    const withClaims = items.filter((g) => g.claims.length > 0);
    const allClaims = withClaims.flatMap((g) => g.claims.map((c) => ({ ...c, bgNumber: g.bgNumber })));
    return {
      title: 'Yêu cầu gọi bảo lãnh',
      summary:
        allClaims.length === 0
          ? 'Hiện không có yêu cầu gọi bảo lãnh nào.'
          : `${allClaims.length} yêu cầu gọi bảo lãnh đang xử lý trên ${withClaims.length} bảo lãnh.`,
      metrics: [{ label: 'Số claim', value: String(allClaims.length) }],
      records: allClaims,
    };
  },
  GUARANTEE_EXTENSION: () => {
    const items = bankGuaranteesRepository.readAll().filter((g) => g.status === 'ACTIVE' && g.extensionRequested);
    return {
      title: 'Bảo lãnh cần gia hạn',
      summary: items.length === 0 ? 'Hiện không có bảo lãnh nào cần gia hạn.' : `${items.length} bảo lãnh cần gia hạn.`,
      metrics: [{ label: 'Số bảo lãnh', value: String(items.length) }],
      records: items,
    };
  },
  GUARANTEE_REQUEST: () => ({
    title: 'Yêu cầu phát hành bảo lãnh',
    summary: 'Thông thường cần chuẩn bị: đề nghị phát hành bảo lãnh, hợp đồng/gói thầu liên quan, tài sản đảm bảo (nếu có), hồ sơ theo yêu cầu ngân hàng.',
    metrics: [],
    records: [],
  }),
  COLLECTION_OVERDUE: (ctx) => {
    const items = collectionsRepository.readAll().filter((c) => c.status === 'OVERDUE');
    const perCollection = items
      .slice(0, 3)
      .map((c) => buildAction('OPEN_COLLECTION_DETAIL', ctx.navigationActions, c.collectionNumber))
      .filter((a): a is AnswerAction => !!a)
      .map((a, i) => ({ ...a, label: `Xem ${items[i].collectionNumber}` }));
    const viewAll = buildAction('OPEN_COLLECTION', ctx.navigationActions);
    return {
      title: 'Nhờ thu quá hạn',
      summary: items.length === 0 ? 'Hiện không có bộ nhờ thu nào quá hạn.' : `${items.length} bộ nhờ thu đã quá hạn.`,
      metrics: [{ label: 'Số bộ quá hạn', value: String(items.length) }],
      records: items,
      actions: viewAll ? [...perCollection, { ...viewAll, label: 'Xem tất cả nhờ thu' }] : perCollection,
    };
  },
  COLLECTION_PAYMENT_STATUS: (ctx) => {
    const items = collectionsRepository.readAll();
    const docId = ctx.query.entities.documentId;
    if (docId) {
      const found = items.find((c) => c.collectionNumber === docId);
      if (!found) return emptyAnswer('Trạng thái thanh toán nhờ thu', 'Không tìm thấy bộ nhờ thu phù hợp.');
      return {
        title: 'Trạng thái thanh toán nhờ thu',
        summary: `${found.collectionNumber} (${found.subType}) đang ở trạng thái ${found.status}.`,
        metrics: [{ label: 'Trạng thái', value: found.status }],
        records: [found],
        action: buildAction('OPEN_COLLECTION_DETAIL', ctx.navigationActions, found.collectionNumber),
      };
    }
    const waiting = items.filter((c) => c.status === 'AWAITING_PAYMENT' || c.status === 'AWAITING_ACCEPTANCE');
    return {
      title: 'Nhờ thu đang chờ xử lý',
      summary:
        waiting.length === 0
          ? 'Hiện không có bộ nhờ thu nào đang chờ thanh toán/chấp nhận.'
          : `${waiting.length} bộ nhờ thu đang chờ thanh toán/chấp nhận.`,
      metrics: [{ label: 'Đang chờ', value: String(waiting.length) }],
      records: waiting,
    };
  },

  // ---- LENDING ----------------------------------------------------------------------
  LOAN_LIST: () => {
    const items = loansRepository.readAll();
    return {
      title: 'Khoản vay',
      summary: `Doanh nghiệp hiện có ${items.length} khoản vay.`,
      metrics: [{ label: 'Số khoản vay', value: String(items.length) }],
      records: items,
    };
  },
  LOAN_OUTSTANDING: () => {
    const items = loansRepository.readAll().filter((l) => l.status === 'ACTIVE');
    const total = agg.sum(items, (l) => l.outstanding);
    return {
      title: 'Dư nợ hiện tại',
      summary: `Tổng dư nợ vay hiện tại: ${fmt(total)}.`,
      metrics: [{ label: 'Tổng dư nợ', value: fmt(total) }],
      records: items,
    };
  },
  CREDIT_LIMIT: () => {
    const items = creditLimitsRepository.readAll();
    const overall = items.find((c) => c.limitType === 'OVERALL') ?? items[0];
    if (!overall) return emptyAnswer('Hạn mức tín dụng', 'Chưa có dữ liệu hạn mức tín dụng.');
    return {
      title: 'Hạn mức tín dụng',
      summary: `Hạn mức đã cấp ${fmt(overall.totalLimit)}, còn lại ${fmt(overall.availableAmount)}.`,
      metrics: items.map((c) => ({ label: c.limitType, value: `${fmt(c.availableAmount)} / ${fmt(c.totalLimit)}` })),
      records: items,
    };
  },

  // ---- PRODUCT -------------------------------------------------------------------------
  PRODUCT_RECOMMEND: () => {
    const active = recommendationsRepository.readAll();
    const products = productsRepository.readAll();
    if (active.length === 0) return emptyAnswer('Gợi ý dành cho doanh nghiệp', 'Hiện chưa có gợi ý sản phẩm nào phù hợp.');
    return {
      title: 'Gợi ý dành cho doanh nghiệp',
      summary: `${active.length} gợi ý sản phẩm phù hợp với hoạt động hiện tại: ${active.map((r) => r.title).join(', ')}.`,
      metrics: active.map((r) => ({ label: r.title, value: r.reason })),
      records: active.map((r) => ({ ...r, product: products.find((p) => p.id === r.productId) })),
    };
  },

  // ---- CUSTOMER SERVICE ----------------------------------------------------------------
  GREETING: () => {
    const customer = customerRepository.read();
    return {
      title: 'Virtual RM',
      summary: `Chào anh/chị${customer ? ', ' + customer.companyName : ''} 👋 Tôi có thể giúp gì cho anh/chị hôm nay?`,
      metrics: [],
      records: [],
    };
  },
  HELP: () => ({
    title: 'Virtual RM có thể giúp gì',
    summary:
      'Tôi có thể tra cứu số dư, giao dịch, phê duyệt, dòng tiền, LC/bảo lãnh, khoản vay, tỷ giá và gợi ý sản phẩm — anh/chị cứ hỏi tự nhiên.',
    metrics: [],
    records: [],
  }),

  // ---- BUSINESS_BRIEFING (extension, not one of the 50 core intents) -------------------
  BUSINESS_BRIEFING: (ctx) => generateBriefing(ctx),
  // ---- TRADE_FINANCE_BRIEFING (Phase 6 extension, same pattern as BUSINESS_BRIEFING) ---
  TRADE_FINANCE_BRIEFING: (ctx) => generateTradeFinanceBriefing(ctx),
};

function generateBriefing(ctx: GenerateContext): Omit<SemanticAnswer, 'action'> {
  const customer = customerRepository.read();
  const accounts = accountsRepository.readAll();
  const balance = accounts.filter((a) => a.currency === 'VND').reduce((s, a) => s + a.balance, 0);
  const today = ctx.anchorToday;
  const todayRange: DateRange = { from: today, to: today };
  const txns = transactionsRepository.readAll();
  const incomingToday = agg.sum(
    txns.filter((t) => t.type === 'CREDIT' && isWithinRange(t.date, todayRange)),
    (t) => t.amount,
  );
  const outgoingToday = agg.sum(
    txns.filter((t) => t.type === 'DEBIT' && isWithinRange(t.date, todayRange)),
    (t) => t.amount,
  );
  const pending = txns.filter((t) => t.status === 'PENDING_APPROVAL');
  const pendingTotal = agg.sum(pending, (t) => t.amount);
  const alerts = alertsRepository.readAll();
  const lcSoon = letterOfCreditsRepository
    .readAll()
    .filter((l) => l.status === 'ACTIVE' && isWithinRange(l.expiryDate, { from: today, to: addDaysLocal(today, 30) }));

  const metrics: MetricItem[] = [
    { label: '💰 Thanh khoản', value: formatShortVnd(balance) },
    { label: '📥 Tiền vào hôm nay', value: formatShortVnd(incomingToday) },
    { label: '📤 Tiền ra hôm nay', value: formatShortVnd(outgoingToday) },
    { label: '📝 Chờ duyệt', value: `${pending.length} giao dịch — ${formatShortVnd(pendingTotal)}` },
    { label: '⚠️ Cảnh báo', value: `${alerts.length} cảnh báo` },
    { label: '📄 Trade Finance', value: `${lcSoon.length} LC sắp hết hạn` },
  ];

  // Phase 5 (AI Reasoning) RM Insight (spec §16): a one-line liquidity-pressure signal for
  // the next 7 days, computed via the Calculation Engine — never a generated/invented number.
  const week: DateRange = { from: today, to: addDaysLocal(today, 7) };
  const loans7d = loansRepository.readAll().filter((l) => l.status === 'ACTIVE' && isWithinRange(l.maturityDate, week));
  // Exclude a payable that's really the same obligation as a loan maturing in-window (this
  // demo's data records a loan installment both as a payable and via the loan's own
  // maturityDate/outstanding — see ai/reasoning-engine.ts's LIQUIDITY_ANALYSIS case for the
  // same fix) so it isn't counted twice in one 7-day obligation total.
  const loanNumbers7d = new Set(loans7d.map((l) => l.loanNumber));
  const payables7d = payablesRepository.readAll().filter((p) => isWithinRange(p.dueDate, week) && !loanNumbers7d.has(p.relatedInvoice));
  const gap7d = calculateLiquidityGap(balance, payables7d, loans7d);
  const insights = [
    gap7d.sufficient
      ? `Tuần tới nghĩa vụ thanh toán khoảng ${formatShortVnd(gap7d.obligations)}, thanh khoản hiện tại đủ đáp ứng.`
      : `Tuần tới có áp lực thanh khoản khoảng ${formatShortVnd(Math.abs(gap7d.gap))}. Nên xem xét các khoản thu dự kiến trước khi thực hiện các khoản chi lớn.`,
  ];

  return {
    title: 'Business Briefing',
    summary: `Chào anh/chị, ${customer.companyName} 👋 Đây là Business Briefing hôm nay.`,
    metrics,
    records: [],
    insights,
  };
}

/** Phase 6's Trade Finance Briefing — same "fixed daily-summary card" shape as
 * generateBriefing() above, not routed through the Reasoning Engine's tool-plan machinery
 * (that's for chat questions; a briefing is a standing summary, same distinction the
 * existing Business Briefing already makes). Risk flags reuse the Calculation Engine's
 * calculateLcRisk/calculateGuaranteeRisk — never a re-derived number. */
function generateTradeFinanceBriefing(ctx: GenerateContext): Omit<SemanticAnswer, 'action'> {
  const customer = customerRepository.read();
  const anchorToday = ctx.anchorToday;
  const lcs = letterOfCreditsRepository.readAll();
  const guarantees = bankGuaranteesRepository.readAll();
  const collections = collectionsRepository.readAll();
  const limit = creditLimitsRepository.readAll().find((c) => c.limitType === 'TRADE_FINANCE');

  const activeLcs = lcs.filter((l) => l.status !== 'EXPIRED' && l.status !== 'CANCELLED' && l.status !== 'COMPLETED');
  const activeGuarantees = guarantees.filter((g) => g.status !== 'EXPIRED' && g.status !== 'CANCELLED');
  const openCollections = collections.filter((c) => c.status !== 'COMPLETED' && c.status !== 'CANCELLED');
  const overdueCollections = collections.filter((c) => c.status === 'OVERDUE');

  const lcRisk = activeLcs.map((l) => calculateLcRisk(l, anchorToday)).filter((s) => s.level === 'HIGH');
  const bgRisk = activeGuarantees.map((g) => calculateGuaranteeRisk(g, anchorToday)).filter((s) => s.level === 'HIGH');
  const attentionCount = lcRisk.length + bgRisk.length + overdueCollections.length;
  const utilization = limit && limit.totalLimit > 0 ? Math.round((limit.usedAmount / limit.totalLimit) * 100) : undefined;

  const metrics: MetricItem[] = [
    { label: '📄 LC hiệu lực', value: String(activeLcs.length) },
    { label: '🏦 Bảo lãnh hiệu lực', value: String(activeGuarantees.length) },
    { label: '📬 Nhờ thu đang xử lý', value: String(openCollections.length) },
    { label: '⚠️ Cần chú ý', value: `${attentionCount} việc` },
    { label: '💳 Hạn mức Trade Finance', value: utilization === undefined ? 'Chưa thiết lập' : `${utilization}% đã sử dụng` },
  ];

  const insights = [
    attentionCount === 0
      ? 'Không có LC, bảo lãnh hay nhờ thu nào cần chú ý đặc biệt hôm nay.'
      : `${attentionCount} việc Trade Finance cần chú ý hôm nay — LC rủi ro cao: ${lcRisk.length}, bảo lãnh rủi ro cao: ${bgRisk.length}, nhờ thu quá hạn: ${overdueCollections.length}.`,
  ];

  return {
    title: 'Trade Finance Briefing',
    summary: `Chào anh/chị, ${customer.companyName} 👋 Đây là Trade Finance Briefing hôm nay.`,
    metrics,
    records: [],
    insights,
  };
}

function unknownAnswer(navigationActions: NavigationActionDef[]): SemanticAnswer {
  return {
    title: 'Virtual RM chưa rõ câu hỏi',
    summary: 'Anh/chị có thể hỏi rõ hơn hoặc chọn một gợi ý bên dưới.',
    metrics: [],
    records: [],
    action: buildAction('OPEN_DASHBOARD', navigationActions),
  };
}

function emptyAnswer(title: string, summary: string): Omit<SemanticAnswer, 'action'> {
  return { title, summary, metrics: [], records: [] };
}

function findAccount(accounts: Account[], accountNo?: string): Account | undefined {
  if (!accountNo) return undefined;
  return accounts.find((a) => a.accountNumber === accountNo || a.accountNumber.endsWith(accountNo));
}

function addDaysLocal(dateOnly: string, days: number): string {
  const d = new Date(dateOnly + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Best-effort "same length window, immediately before" previous period for CASH_FLOW_COMPARE. */
function previousPeriod(range: DateRange | undefined, anchorToday: string): DateRange | undefined {
  if (!range) return undefined;
  const from = new Date(range.from + 'T00:00:00Z').getTime();
  const to = new Date(range.to + 'T00:00:00Z').getTime();
  const lengthDays = Math.round((to - from) / 86400000) + 1;
  const prevTo = addDaysLocal(range.from, -1);
  const prevFrom = addDaysLocal(prevTo, -(lengthDays - 1));
  void anchorToday;
  return { from: prevFrom, to: prevTo };
}
