// Reasoning Engine — Phase 5. For each reasoning use case: build a bounded tool-call plan,
// execute it through the Tool Layer (server/src/tools), run the Calculation Engine over the
// results, then hand only the *computed facts* to the AI provider to phrase (never raw
// instructions to "figure out the numbers" — spec §21 no-hallucination policy). If the plan
// would exceed AI_MAX_STEPS, it stops before calling any tool (spec §9).

import { DateRange, MetricItem, NavigationActionDef, SemanticAnswer } from '../semantic/types';
import { formatShortVnd } from '../utils/currency.util';
import {
  getAccountBalance,
  getBankGuarantees,
  getCashPosition,
  getCollections,
  getGuaranteeDeadlines,
  getLcDeadlines,
  getLetterOfCredits,
  getPayables,
  getPaymentOrders,
  getPendingApprovals,
  getProducts,
  getReceivables,
  getRecommendations,
  getLoanObligations,
  getTradeFinanceExposure,
  getTradeFinanceLimits,
  getTransactions,
} from '../tools';
import {
  calculateCashBuffer,
  calculateGuaranteeRisk,
  calculateLcRisk,
  calculateLiquidityGap,
  calculateNetCashflow,
  combineExposure,
  CurrencyTotal,
  PriorityItem,
  rankByUrgency,
} from '../calculation/financial-calculations';
import { AIConfig, ReasoningRequest, UserContext } from './types';
import { getAiProvider } from './ai-client';
import { ReasoningUseCase } from './model-router';

export interface ReasoningDebugInfo {
  useCase: string;
  plan: string[];
  toolsUsed: string[];
  calculationsUsed: string[];
}

export interface ReasoningResult {
  answer: SemanticAnswer;
  debug: ReasoningDebugInfo;
}

function addDaysUtc(dateOnly: string, days: number): string {
  const d = new Date(dateOnly.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function thisMonthRange(anchorToday: string): DateRange {
  const d = new Date(anchorToday.slice(0, 10) + 'T00:00:00Z');
  const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { from, to: anchorToday };
}

function next30DaysRange(anchorToday: string): DateRange {
  return { from: anchorToday, to: addDaysUtc(anchorToday, 30) };
}

interface RunInput {
  useCase: ReasoningUseCase;
  security: UserContext;
  anchorToday: string;
  navigationActions: NavigationActionDef[];
  config: AIConfig;
  companyName?: string;
}

function buildAction(navId: string, navigationActions: NavigationActionDef[], entityId?: string): SemanticAnswer['action'] | undefined {
  const nav = navigationActions.find((n) => n.id === navId);
  if (!nav) return undefined;
  return { label: nav.labelVi, type: 'NAVIGATE', target: nav.id, ...(entityId ? { entityId } : {}) };
}

function priorityRecords(items: PriorityItem[]): unknown[] {
  return items.map((item, i) => ({
    rank: i + 1,
    label: item.label,
    amount: item.amount,
    currency: item.currency,
    dueDate: item.dueDate,
    urgency: item.urgency,
  }));
}

const URGENCY_ICON: Record<PriorityItem['urgency'], string> = { HIGH: '⚠️', MEDIUM: '🟠', LOW: '🔵' };

/** Same VND-shorthand-else-raw-code convention as response-generator.ts's local `fmt()` —
 * exposure/limit amounts here span multiple currencies (LC amounts are often USD), so a
 * VND-only formatter isn't enough. */
function formatCcy(amount: number, currency: string): string {
  return currency === 'VND' ? formatShortVnd(amount) : `${amount.toLocaleString('vi-VN')} ${currency}`;
}

function formatCcyList(totals: CurrencyTotal[]): string {
  return totals.length === 0 ? 'không có' : totals.map((t) => formatCcy(t.amount, t.currency)).join(', ');
}

function formatPriorityInsights(items: PriorityItem[]): string[] {
  return items.slice(0, 5).map((item, i) => {
    const due = item.daysUntilDue === undefined ? '' : item.daysUntilDue <= 0 ? 'Đến hạn: hôm nay' : `Đến hạn: ${item.daysUntilDue} ngày nữa`;
    return `${i + 1}. ${formatShortVnd(item.amount)} — ${item.label}${due ? `\n   ${due}` : ''}\n   ${URGENCY_ICON[item.urgency]} Ưu tiên ${
      item.urgency === 'HIGH' ? 'cao' : item.urgency === 'MEDIUM' ? 'trung bình' : 'thấp'
    }`;
  });
}

/** Plans are defined declaratively per use case so AI_MAX_STEPS can be checked before any
 * tool actually runs (spec §9: "Nếu plan vượt quá giới hạn → dừng"). */
const PLANS: Record<ReasoningUseCase, string[]> = {
  CASHFLOW_ANALYSIS: [getTransactions.name],
  LIQUIDITY_ANALYSIS: [getCashPosition.name, getPayables.name, getLoanObligations.name],
  IDLE_CASH_ANALYSIS: [getCashPosition.name, getReceivables.name, getPayables.name],
  PAYMENT_PRIORITIZATION: [getPayables.name],
  APPROVAL_PRIORITIZATION: [getPendingApprovals.name],
  PRODUCT_RECOMMENDATION_REASONING: [getCashPosition.name, getReceivables.name, getPayables.name, getRecommendations.name, getProducts.name],
  LC_RISK_PRIORITIZATION: [getLcDeadlines.name],
  GUARANTEE_RISK_PRIORITIZATION: [getGuaranteeDeadlines.name],
  TRADE_FINANCE_EXPOSURE: [getTradeFinanceExposure.name],
  TRADE_FINANCE_LIMIT_ANALYSIS: [getTradeFinanceLimits.name],
  TRADE_FINANCE_OVERVIEW: [getLetterOfCredits.name, getBankGuarantees.name, getCollections.name, getTradeFinanceExposure.name, getTradeFinanceLimits.name],
  TRADE_FINANCE_ATTENTION: [getLcDeadlines.name, getGuaranteeDeadlines.name, getCollections.name],
};

export async function runReasoning(input: RunInput): Promise<ReasoningResult> {
  const { useCase, security, anchorToday, navigationActions, config } = input;
  const plan = PLANS[useCase];

  if (plan.length > config.maxSteps) {
    return {
      answer: {
        title: 'Câu hỏi quá phức tạp',
        summary: `Câu hỏi này cần ${plan.length} bước phân tích, vượt giới hạn ${config.maxSteps} bước. Anh/chị có thể hỏi cụ thể hơn không?`,
        metrics: [],
        records: [],
      },
      debug: { useCase, plan, toolsUsed: [], calculationsUsed: [] },
    };
  }

  const provider = getAiProvider();
  const toolsUsed: string[] = [];
  const calculationsUsed: string[] = [];

  switch (useCase) {
    case 'CASHFLOW_ANALYSIS': {
      const range = thisMonthRange(anchorToday);
      const txns = getTransactions.execute(security, { range });
      toolsUsed.push(getTransactions.name);
      const net = calculateNetCashflow(txns);
      calculationsUsed.push('NET_CASHFLOW');

      const reasoning = await provider.reason(
        buildRequest('CASHFLOW_ANALYSIS', 'Phân tích dòng tiền trong kỳ', {
          incoming: formatShortVnd(net.incoming),
          outgoing: formatShortVnd(net.outgoing),
          net: formatShortVnd(net.net),
          trend: net.trend,
          periodLabel: 'tháng này',
        }),
      );

      const metrics: MetricItem[] = [
        { label: 'Tiền vào', value: formatShortVnd(net.incoming) },
        { label: 'Tiền ra', value: formatShortVnd(net.outgoing) },
        { label: 'Net cashflow', value: formatShortVnd(net.net) },
      ];
      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics,
          records: txns.slice(0, 10),
          insights: reasoning.insights,
          action: buildAction('OPEN_DASHBOARD', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'LIQUIDITY_ANALYSIS': {
      const range = next30DaysRange(anchorToday);
      const position = getCashPosition.execute(security, {});
      const allPayables = getPayables.execute(security, { range });
      const loanObligations = getLoanObligations.execute(security, { range });
      toolsUsed.push(getCashPosition.name, getPayables.name, getLoanObligations.name);

      // A payable whose relatedInvoice matches a loan's own loanNumber (this demo's data has
      // the scheduled loan-installment payment order recorded both ways — see payables.json's
      // "MSB - Phòng Tín dụng" entry) is the same real-world obligation as the loan's
      // outstanding balance; summing both would double-count it.
      const loanNumbers = new Set(loanObligations.map((l) => l.loanNumber));
      const payables = allPayables.filter((p) => !loanNumbers.has(p.relatedInvoice));

      const gapResult = calculateLiquidityGap(position.totalVnd, payables, loanObligations);
      calculationsUsed.push('LIQUIDITY_GAP');

      const payablesTotal = payables.reduce((s, p) => s + p.amount, 0);
      const loanTotal = loanObligations.reduce((s, l) => s + l.outstanding, 0);

      const reasoning = await provider.reason(
        buildRequest('LIQUIDITY_ANALYSIS', 'Đánh giá khả năng thanh khoản 30 ngày tới', {
          availableCash: formatShortVnd(position.totalVnd),
          payables: formatShortVnd(payablesTotal),
          loanObligations: formatShortVnd(loanTotal),
          projectedCash: formatShortVnd(gapResult.gap),
          sufficient: gapResult.sufficient,
        }),
      );

      const metrics: MetricItem[] = [
        { label: 'Số dư khả dụng', value: formatShortVnd(position.totalVnd) },
        { label: 'Phải trả (30 ngày)', value: formatShortVnd(payablesTotal) },
        { label: 'Trả nợ vay (30 ngày)', value: formatShortVnd(loanTotal) },
        { label: 'Dự kiến còn', value: formatShortVnd(gapResult.gap) },
      ];
      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics,
          records: [],
          insights: reasoning.insights,
          action: buildAction('OPEN_DASHBOARD', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'IDLE_CASH_ANALYSIS': {
      const range = next30DaysRange(anchorToday);
      const position = getCashPosition.execute(security, {});
      const receivables = getReceivables.execute(security, { range });
      const payables = getPayables.execute(security, { range });
      toolsUsed.push(getCashPosition.name, getReceivables.name, getPayables.name);

      const receivablesTotal = receivables.reduce((s, r) => s + r.amount, 0);
      const payablesTotal = payables.reduce((s, p) => s + p.amount, 0);
      const buffer = calculateCashBuffer(position.totalVnd, receivablesTotal, payablesTotal);
      calculationsUsed.push('CASH_BUFFER');

      const reasoning = await provider.reason(
        buildRequest('IDLE_CASH_ANALYSIS', 'Ước tính tiền nhàn rỗi 30 ngày tới', {
          idleCash: formatShortVnd(buffer.idleCash),
          hasIdle: buffer.hasIdle,
        }),
      );

      const metrics: MetricItem[] = [
        { label: 'Tiền hiện có', value: formatShortVnd(position.totalVnd) },
        { label: 'Dự kiến thu (30 ngày)', value: formatShortVnd(receivablesTotal) },
        { label: 'Dự kiến chi (30 ngày)', value: formatShortVnd(payablesTotal) },
        { label: 'Ước tính nhàn rỗi', value: formatShortVnd(buffer.idleCash) },
      ];
      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics,
          records: [],
          insights: reasoning.insights,
          recommendation: reasoning.recommendation,
          action: buildAction('OPEN_PRODUCT', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'PAYMENT_PRIORITIZATION': {
      const range = next30DaysRange(anchorToday);
      const payables = getPayables.execute(security, { range });
      toolsUsed.push(getPayables.name);

      const ranked = rankByUrgency(
        payables.map((p) => ({ id: p.id, label: p.supplier, amount: p.amount, currency: p.currency, dueDate: p.dueDate, anchorToday })),
      );
      calculationsUsed.push('RANK_BY_URGENCY');

      const reasoning = await provider.reason(
        buildRequest('PAYMENT_PRIORITIZATION', 'Xếp hạng ưu tiên thanh toán 30 ngày tới', { count: ranked.length }),
      );

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: [{ label: 'Số khoản phải trả', value: String(ranked.length) }],
          records: priorityRecords(ranked),
          insights: formatPriorityInsights(ranked),
          action: buildAction('OPEN_PAYMENT', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'APPROVAL_PRIORITIZATION': {
      const pending = getPendingApprovals.execute(security, {});
      toolsUsed.push(getPendingApprovals.name);

      const ranked = rankByUrgency(
        pending
          .filter((p) => p.order)
          .map((p) => ({
            id: p.approval.id,
            label: p.order!.beneficiary,
            amount: p.order!.amount,
            currency: p.order!.currency,
            anchorToday,
          })),
      );
      calculationsUsed.push('RANK_BY_URGENCY');

      const reasoning = await provider.reason(
        buildRequest('APPROVAL_PRIORITIZATION', 'Xếp hạng ưu tiên phê duyệt', { count: ranked.length }),
      );

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: [{ label: 'Số giao dịch chờ duyệt', value: String(ranked.length) }],
          records: priorityRecords(ranked),
          insights: formatPriorityInsights(ranked),
          action: buildAction('OPEN_APPROVAL', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'PRODUCT_RECOMMENDATION_REASONING': {
      const range = next30DaysRange(anchorToday);
      const position = getCashPosition.execute(security, {});
      const receivables = getReceivables.execute(security, { range });
      const payables = getPayables.execute(security, { range });
      const recommendations = getRecommendations.execute(security, {});
      const products = getProducts.execute(security, {});
      toolsUsed.push(getCashPosition.name, getReceivables.name, getPayables.name, getRecommendations.name, getProducts.name);

      const receivablesTotal = receivables.reduce((s, r) => s + r.amount, 0);
      const payablesTotal = payables.reduce((s, p) => s + p.amount, 0);
      const buffer = calculateCashBuffer(position.totalVnd, receivablesTotal, payablesTotal);
      calculationsUsed.push('CASH_BUFFER');

      // Only recommend products that actually exist in recommendations.json/products.json —
      // never invent one (spec §19: "Không được invent product") — and only the ones whose
      // own eligibility rule is actually about idle cash / liquidity (ruleKey), not every
      // currently-active recommendation regardless of relevance to this question.
      const cashRelevant = recommendations.filter((r) => /CASH|DEPOSIT/i.test(r.ruleKey));
      const productNames = cashRelevant
        .map((r) => products.find((p) => p.id === r.productId)?.name)
        .filter((name): name is string => !!name);

      const reasoning = await provider.reason(
        buildRequest('PRODUCT_RECOMMENDATION_REASONING', 'Gợi ý sản phẩm dựa trên dòng tiền hiện tại', {
          idleCash: formatShortVnd(buffer.idleCash),
          hasIdle: buffer.hasIdle,
          productNames,
        }),
      );

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: buffer.hasIdle ? [{ label: 'Ước tính nhàn rỗi', value: formatShortVnd(buffer.idleCash) }] : [],
          records: cashRelevant,
          insights: reasoning.insights,
          recommendation: reasoning.recommendation,
          action: buildAction('OPEN_PRODUCT', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    // ---- Trade Finance (Phase 6) ---------------------------------------------------------

    case 'LC_RISK_PRIORITIZATION': {
      const lcs = getLcDeadlines.execute(security, {});
      toolsUsed.push(getLcDeadlines.name);
      const scored = lcs.map((lc) => calculateLcRisk(lc, anchorToday)).sort((a, b) => b.score - a.score);
      calculationsUsed.push('LC_RISK_SCORE');
      const highCount = scored.filter((s) => s.level === 'HIGH').length;
      const top = scored[0];

      const reasoning = await provider.reason(
        buildRequest('LC_RISK_PRIORITIZATION', 'Xếp hạng LC theo mức độ rủi ro cần xử lý', {
          count: scored.length,
          highCount,
          topLcNumber: top?.lcNumber,
          topReasons: top?.reasons ?? [],
        }),
      );

      const lcActions = scored
        .filter((s) => s.score > 0)
        .slice(0, 3)
        .map((s) => {
          const a = buildAction('OPEN_LC_DETAIL', navigationActions, s.lcNumber);
          return a ? { ...a, label: `Xem ${s.lcNumber}` } : undefined;
        })
        .filter((a): a is NonNullable<typeof a> => !!a);
      const lcViewAll = buildAction('OPEN_LC', navigationActions);

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: [
            { label: 'Số LC đang theo dõi', value: String(scored.length) },
            { label: 'Mức rủi ro cao', value: String(highCount) },
          ],
          records: scored,
          insights: reasoning.insights,
          action: buildAction('OPEN_TRADE_FINANCE', navigationActions),
          actions: lcViewAll ? [...lcActions, { ...lcViewAll, label: 'Xem tất cả LC' }] : lcActions,
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'GUARANTEE_RISK_PRIORITIZATION': {
      const guarantees = getGuaranteeDeadlines.execute(security, {});
      toolsUsed.push(getGuaranteeDeadlines.name);
      const scored = guarantees.map((g) => calculateGuaranteeRisk(g, anchorToday)).sort((a, b) => b.score - a.score);
      calculationsUsed.push('GUARANTEE_RISK_SCORE');
      const highCount = scored.filter((s) => s.level === 'HIGH').length;
      const top = scored[0];

      const reasoning = await provider.reason(
        buildRequest('GUARANTEE_RISK_PRIORITIZATION', 'Xếp hạng bảo lãnh theo mức độ rủi ro cần xử lý', {
          count: scored.length,
          highCount,
          topBgNumber: top?.bgNumber,
          topReasons: top?.reasons ?? [],
        }),
      );

      const bgActions = scored
        .filter((s) => s.score > 0)
        .slice(0, 3)
        .map((s) => {
          const a = buildAction('OPEN_GUARANTEE_DETAIL', navigationActions, s.bgNumber);
          return a ? { ...a, label: `Xem ${s.bgNumber}` } : undefined;
        })
        .filter((a): a is NonNullable<typeof a> => !!a);
      const bgViewAll = buildAction('OPEN_GUARANTEE', navigationActions);

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: [
            { label: 'Số bảo lãnh đang theo dõi', value: String(scored.length) },
            { label: 'Mức rủi ro cao', value: String(highCount) },
          ],
          records: scored,
          insights: reasoning.insights,
          action: buildAction('OPEN_TRADE_FINANCE', navigationActions),
          actions: bgViewAll ? [...bgActions, { ...bgViewAll, label: 'Xem tất cả bảo lãnh' }] : bgActions,
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'TRADE_FINANCE_EXPOSURE': {
      const exposure = getTradeFinanceExposure.execute(security, {});
      toolsUsed.push(getTradeFinanceExposure.name);
      const total = combineExposure([exposure.lc, exposure.guarantee, exposure.collection]);
      calculationsUsed.push('COMBINE_EXPOSURE');

      const reasoning = await provider.reason(
        buildRequest('TRADE_FINANCE_EXPOSURE', 'Tổng hợp exposure Trade Finance theo loại và theo tiền tệ', {
          lcExposure: formatCcyList(exposure.lc),
          guaranteeExposure: formatCcyList(exposure.guarantee),
          collectionExposure: formatCcyList(exposure.collection),
          totalExposure: formatCcyList(total),
        }),
      );

      const metrics: MetricItem[] = total.map((t) => ({ label: `Tổng exposure (${t.currency})`, value: formatCcy(t.amount, t.currency) }));
      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics,
          records: [
            ...exposure.lc.map((e) => ({ ...e, loại: 'LC' })),
            ...exposure.guarantee.map((e) => ({ ...e, loại: 'Bảo lãnh' })),
            ...exposure.collection.map((e) => ({ ...e, loại: 'Nhờ thu' })),
          ],
          insights: reasoning.insights,
          action: buildAction('OPEN_TRADE_FINANCE', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'TRADE_FINANCE_LIMIT_ANALYSIS': {
      const limit = getTradeFinanceLimits.execute(security, {});
      toolsUsed.push(getTradeFinanceLimits.name);
      if (!limit) {
        return {
          answer: { title: 'Hạn mức Trade Finance', summary: 'Hiện chưa thiết lập hạn mức Trade Finance.', metrics: [], records: [] },
          debug: { useCase, plan, toolsUsed, calculationsUsed },
        };
      }
      const utilization = limit.totalLimit > 0 ? Math.round((limit.usedAmount / limit.totalLimit) * 100) : 0;
      calculationsUsed.push('LIMIT_UTILIZATION');

      const reasoning = await provider.reason(
        buildRequest('TRADE_FINANCE_LIMIT_ANALYSIS', 'Đánh giá hạn mức Trade Finance', {
          totalLimit: formatCcy(limit.totalLimit, limit.currency),
          usedAmount: formatCcy(limit.usedAmount, limit.currency),
          availableAmount: formatCcy(limit.availableAmount, limit.currency),
          utilization,
        }),
      );

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: [
            { label: 'Tổng hạn mức', value: formatCcy(limit.totalLimit, limit.currency) },
            { label: 'Đã sử dụng', value: formatCcy(limit.usedAmount, limit.currency) },
            { label: 'Còn khả dụng', value: formatCcy(limit.availableAmount, limit.currency) },
            { label: 'Tỷ lệ sử dụng', value: `${utilization}%` },
          ],
          records: [limit],
          insights: reasoning.insights,
          recommendation: reasoning.recommendation,
          action: buildAction('OPEN_TRADE_FINANCE', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'TRADE_FINANCE_OVERVIEW': {
      const lcs = getLetterOfCredits.execute(security, {});
      const guarantees = getBankGuarantees.execute(security, {});
      const collections = getCollections.execute(security, {});
      const exposure = getTradeFinanceExposure.execute(security, {});
      const limit = getTradeFinanceLimits.execute(security, {});
      toolsUsed.push(getLetterOfCredits.name, getBankGuarantees.name, getCollections.name, getTradeFinanceExposure.name, getTradeFinanceLimits.name);

      const total = combineExposure([exposure.lc, exposure.guarantee, exposure.collection]);
      calculationsUsed.push('COMBINE_EXPOSURE');

      const activeLcs = lcs.filter((l) => l.status !== 'EXPIRED' && l.status !== 'CANCELLED' && l.status !== 'COMPLETED').length;
      const activeGuarantees = guarantees.filter((g) => g.status !== 'EXPIRED' && g.status !== 'CANCELLED').length;
      const openCollections = collections.filter((c) => c.status !== 'COMPLETED' && c.status !== 'CANCELLED').length;
      const utilization = limit && limit.totalLimit > 0 ? Math.round((limit.usedAmount / limit.totalLimit) * 100) : undefined;

      const reasoning = await provider.reason(
        buildRequest('TRADE_FINANCE_OVERVIEW', 'Tổng quan hoạt động Trade Finance', {
          activeLcs,
          activeGuarantees,
          openCollections,
          totalExposure: formatCcyList(total),
          utilization,
        }),
      );

      const metrics: MetricItem[] = [
        { label: 'LC đang hiệu lực', value: String(activeLcs) },
        { label: 'Bảo lãnh đang hiệu lực', value: String(activeGuarantees) },
        { label: 'Nhờ thu đang xử lý', value: String(openCollections) },
        ...total.map((t) => ({ label: `Tổng exposure (${t.currency})`, value: formatCcy(t.amount, t.currency) })),
      ];
      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics,
          records: [],
          insights: reasoning.insights,
          action: buildAction('OPEN_TRADE_FINANCE', navigationActions),
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }

    case 'TRADE_FINANCE_ATTENTION': {
      const lcs = getLcDeadlines.execute(security, {});
      const guarantees = getGuaranteeDeadlines.execute(security, {});
      const collections = getCollections.execute(security, {});
      toolsUsed.push(getLcDeadlines.name, getGuaranteeDeadlines.name, getCollections.name);

      const lcRisk = lcs.map((lc) => calculateLcRisk(lc, anchorToday)).filter((s) => s.score > 0);
      const bgRisk = guarantees.map((g) => calculateGuaranteeRisk(g, anchorToday)).filter((s) => s.score > 0);
      const overdueCollections = collections.filter((c) => c.status === 'OVERDUE');
      calculationsUsed.push('LC_RISK_SCORE', 'GUARANTEE_RISK_SCORE');

      const attentionItems = [
        ...lcRisk.map((s) => ({ loại: 'LC', mã: s.lcNumber, score: s.score, level: s.level, reasons: s.reasons })),
        ...bgRisk.map((s) => ({ loại: 'Bảo lãnh', mã: s.bgNumber, score: s.score, level: s.level, reasons: s.reasons })),
        ...overdueCollections.map((c) => ({ loại: 'Nhờ thu', mã: c.collectionNumber, score: 50, level: 'HIGH' as const, reasons: ['Đã quá hạn'] })),
      ].sort((a, b) => b.score - a.score);
      const highCount = attentionItems.filter((i) => i.level === 'HIGH').length;

      const reasoning = await provider.reason(
        buildRequest('TRADE_FINANCE_ATTENTION', 'Trade Finance cần chú ý hôm nay', {
          count: attentionItems.length,
          highCount,
        }),
      );

      const attentionNavTarget: Record<string, string> = { LC: 'OPEN_LC_DETAIL', 'Bảo lãnh': 'OPEN_GUARANTEE_DETAIL', 'Nhờ thu': 'OPEN_COLLECTION_DETAIL' };
      const attentionActions = attentionItems
        .slice(0, 3)
        .map((item) => {
          const a = buildAction(attentionNavTarget[item.loại], navigationActions, item.mã);
          return a ? { ...a, label: `Xem ${item.mã}` } : undefined;
        })
        .filter((a): a is NonNullable<typeof a> => !!a);
      const attentionViewAll = buildAction('OPEN_TRADE_FINANCE', navigationActions);

      return {
        answer: {
          title: reasoning.title,
          summary: reasoning.summary,
          metrics: [
            { label: 'Việc cần chú ý', value: String(attentionItems.length) },
            { label: 'Mức ưu tiên cao', value: String(highCount) },
          ],
          records: attentionItems,
          insights: reasoning.insights,
          action: buildAction('OPEN_TRADE_FINANCE', navigationActions),
          actions: attentionViewAll ? [...attentionActions, { ...attentionViewAll, label: 'Xem Trade Finance Dashboard' }] : attentionActions,
        },
        debug: { useCase, plan, toolsUsed, calculationsUsed },
      };
    }
  }
}

function buildRequest(useCase: string, goal: string, facts: Record<string, unknown>): ReasoningRequest {
  return { useCase, goal, facts };
}
