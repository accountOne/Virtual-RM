// Reasoning Engine — Phase 5. For each reasoning use case: build a bounded tool-call plan,
// execute it through the Tool Layer (server/src/tools), run the Calculation Engine over the
// results, then hand only the *computed facts* to the AI provider to phrase (never raw
// instructions to "figure out the numbers" — spec §21 no-hallucination policy). If the plan
// would exceed AI_MAX_STEPS, it stops before calling any tool (spec §9).

import { DateRange, MetricItem, NavigationActionDef, SemanticAnswer } from '../semantic/types';
import { formatShortVnd } from '../utils/currency.util';
import {
  getAccountBalance,
  getCashPosition,
  getPayables,
  getPaymentOrders,
  getPendingApprovals,
  getProducts,
  getReceivables,
  getRecommendations,
  getLoanObligations,
  getTransactions,
} from '../tools';
import { calculateCashBuffer, calculateLiquidityGap, calculateNetCashflow, PriorityItem, rankByUrgency } from '../calculation/financial-calculations';
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

function buildAction(navId: string, navigationActions: NavigationActionDef[]): SemanticAnswer['action'] | undefined {
  const nav = navigationActions.find((n) => n.id === navId);
  if (!nav) return undefined;
  return { label: nav.labelVi, type: 'NAVIGATE', target: nav.id };
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
  }
}

function buildRequest(useCase: string, goal: string, facts: Record<string, unknown>): ReasoningRequest {
  return { useCase, goal, facts };
}
