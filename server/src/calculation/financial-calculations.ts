// Calculation Engine — Phase 5. Named, reusable financial formulas the Reasoning Engine calls
// instead of letting an AI provider compute numbers itself (spec §10, §21 no-hallucination
// policy: "Model KHÔNG được tự tính toán các con số tài chính quan trọng"). Builds on the
// existing generic aggregation primitives in semantic/aggregation-engine.ts — this file adds
// the higher-level, business-meaning formulas, it doesn't re-implement sum/avg/etc.

import * as agg from '../semantic/aggregation-engine';
import { Loan, Payable, Receivable, Transaction } from '../models';

export interface NetCashflowResult {
  incoming: number;
  outgoing: number;
  net: number;
  trend: 'dương' | 'âm' | 'cân bằng';
}

export function calculateNetCashflow(transactions: Transaction[]): NetCashflowResult {
  const incoming = agg.sum(
    transactions.filter((t) => t.type === 'CREDIT'),
    (t) => t.amount,
  );
  const outgoing = agg.sum(
    transactions.filter((t) => t.type === 'DEBIT'),
    (t) => t.amount,
  );
  const net = incoming - outgoing;
  const trend = net > 0 ? 'dương' : net < 0 ? 'âm' : 'cân bằng';
  return { incoming, outgoing, net, trend };
}

export interface ProjectedCashResult {
  currentCash: number;
  receivables: number;
  payables: number;
  loanObligations: number;
  projectedCash: number;
  currency: string;
}

/**
 * `Available cash + Expected receivable − Expected payable − Loan obligations =
 * Projected cash position` — spec §10's worked example, verbatim.
 */
export function calculateProjectedCash(input: {
  currentCash: number;
  receivables: Receivable[];
  payables: Payable[];
  loanObligations: Loan[];
  currency?: string;
}): ProjectedCashResult {
  const receivablesTotal = agg.sum(input.receivables, (r) => r.amount);
  const payablesTotal = agg.sum(input.payables, (p) => p.amount);
  const loanTotal = agg.sum(input.loanObligations, (l) => l.outstanding);
  const projectedCash = input.currentCash + receivablesTotal - payablesTotal - loanTotal;
  return {
    currentCash: input.currentCash,
    receivables: receivablesTotal,
    payables: payablesTotal,
    loanObligations: loanTotal,
    projectedCash,
    currency: input.currency ?? 'VND',
  };
}

export interface LiquidityGapResult {
  availableCash: number;
  obligations: number;
  gap: number;
  sufficient: boolean;
}

/** Positive gap = surplus after obligations; negative = shortfall. */
export function calculateLiquidityGap(availableCash: number, payables: Payable[], loanObligations: Loan[]): LiquidityGapResult {
  const obligations = agg.sum(payables, (p) => p.amount) + agg.sum(loanObligations, (l) => l.outstanding);
  const gap = availableCash - obligations;
  return { availableCash, obligations, gap, sufficient: gap >= 0 };
}

export interface CashBufferResult {
  currentCash: number;
  expectedIncoming: number;
  expectedOutgoing: number;
  buffer: number;
  idleCash: number;
  hasIdle: boolean;
}

/**
 * `Current cash + expected incoming − expected outgoing − liquidity buffer = potential idle
 * cash` — spec §13's worked example. `bufferRatio` (default 15%) is a conservative safety
 * margin held back before anything is called "idle", so the engine never recommends moving
 * money the business might actually need.
 */
export function calculateCashBuffer(currentCash: number, expectedIncoming: number, expectedOutgoing: number, bufferRatio = 0.15): CashBufferResult {
  const buffer = currentCash * bufferRatio;
  const idleCash = Math.max(0, currentCash + expectedIncoming - expectedOutgoing - buffer);
  return { currentCash, expectedIncoming, expectedOutgoing, buffer, idleCash, hasIdle: idleCash > 0 };
}

export interface OutstandingResult {
  total: number;
  count: number;
}

export function calculateOutstanding(loans: Loan[]): OutstandingResult {
  const active = loans.filter((l) => l.status === 'ACTIVE');
  return { total: agg.sum(active, (l) => l.outstanding), count: active.length };
}

export interface PriorityItem {
  id: string;
  label: string;
  amount: number;
  currency: string;
  dueDate?: string;
  daysUntilDue?: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Ranks items by urgency for prioritization use cases (spec §14/§15): due today/overdue or
 * a large amount is HIGH, due within 3 days is MEDIUM, otherwise LOW — then sorted
 * soonest-due-first, largest-amount-first within a tie. Pure deterministic ranking, no model
 * involved (spec §14: "Không tự thay đổi trạng thái giao dịch. Chỉ recommend.").
 */
export function rankByUrgency(
  items: { id: string; label: string; amount: number; currency: string; dueDate?: string; anchorToday: string }[],
): PriorityItem[] {
  const ranked = items.map((item) => {
    let daysUntilDue: number | undefined;
    if (item.dueDate) {
      const due = new Date(item.dueDate.slice(0, 10) + 'T00:00:00Z').getTime();
      const today = new Date(item.anchorToday.slice(0, 10) + 'T00:00:00Z').getTime();
      daysUntilDue = Math.round((due - today) / 86_400_000);
    }
    const urgency: PriorityItem['urgency'] =
      (daysUntilDue !== undefined && daysUntilDue <= 1) || item.amount >= 5_000_000_000
        ? 'HIGH'
        : daysUntilDue !== undefined && daysUntilDue <= 3
          ? 'MEDIUM'
          : 'LOW';
    return { id: item.id, label: item.label, amount: item.amount, currency: item.currency, dueDate: item.dueDate, daysUntilDue, urgency };
  });
  const urgencyRank: Record<PriorityItem['urgency'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return ranked.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999) || b.amount - a.amount);
}
