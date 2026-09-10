// Calculation Engine — Phase 5. Named, reusable financial formulas the Reasoning Engine calls
// instead of letting an AI provider compute numbers itself (spec §10, §21 no-hallucination
// policy: "Model KHÔNG được tự tính toán các con số tài chính quan trọng"). Builds on the
// existing generic aggregation primitives in semantic/aggregation-engine.ts — this file adds
// the higher-level, business-meaning formulas, it doesn't re-implement sum/avg/etc.

import * as agg from '../semantic/aggregation-engine';
import { BankGuarantee, LetterOfCredit, Loan, Payable, Receivable, Transaction } from '../models';

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

// ---- Trade Finance (Phase 6) ----------------------------------------------------------------

export function daysUntil(dateOnly: string, anchorToday: string): number {
  const target = new Date(dateOnly.slice(0, 10) + 'T00:00:00Z').getTime();
  const today = new Date(anchorToday.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

function deriveRiskLevel(score: number): RiskLevel {
  return score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';
}

export interface LcRiskScore {
  lcNumber: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
  daysUntilShipment: number;
  daysUntilExpiry: number;
  openDiscrepancies: number;
  documentGaps: number;
}

/**
 * Deterministic risk score for one LC (spec §14/§40) — every point traces to a real field
 * on the record (shipment/expiry proximity, open discrepancies, incomplete documents,
 * amount), never a model judgment. Not a legal/compliance conclusion (spec §13/§40's own
 * "Không tự kết luận pháp lý") — purely an operational attention-priority signal.
 */
export function calculateLcRisk(lc: LetterOfCredit, anchorToday: string): LcRiskScore {
  const daysUntilShipment = daysUntil(lc.latestShipmentDate, anchorToday);
  const daysUntilExpiry = daysUntil(lc.expiryDate, anchorToday);
  const openDiscrepancies = lc.discrepancies.filter((d) => d.status === 'OPEN').length;
  const documentGaps = lc.documents.filter((d) => d.status === 'MISSING' || d.status === 'DISCREPANT' || d.status === 'PENDING').length;

  let score = 0;
  const reasons: string[] = [];
  if (daysUntilShipment <= 3) {
    score += 40;
    reasons.push(daysUntilShipment < 0 ? 'Đã quá hạn giao hàng' : `Shipment deadline còn ${daysUntilShipment} ngày`);
  }
  if (daysUntilExpiry <= 7) {
    score += 25;
    reasons.push(daysUntilExpiry < 0 ? 'LC đã hết hạn' : `Hết hạn còn ${daysUntilExpiry} ngày`);
  }
  if (openDiscrepancies > 0) {
    score += Math.min(openDiscrepancies, 2) * 20;
    reasons.push(`${openDiscrepancies} sai biệt đang mở`);
  }
  if (documentGaps > 0) {
    score += Math.min(documentGaps, 2) * 15;
    reasons.push(`${documentGaps} chứng từ thiếu/chờ xử lý`);
  }
  if (lc.amount >= 1_500_000_000) score += 10;

  return { lcNumber: lc.lcNumber, score, level: deriveRiskLevel(score), reasons, daysUntilShipment, daysUntilExpiry, openDiscrepancies, documentGaps };
}

export interface GuaranteeRiskScore {
  bgNumber: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
  daysUntilExpiry: number;
  activeClaims: number;
}

export function calculateGuaranteeRisk(bg: BankGuarantee, anchorToday: string): GuaranteeRiskScore {
  const daysUntilExpiry = daysUntil(bg.expiryDate, anchorToday);
  const activeClaims = bg.claims.filter((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW').length;

  let score = 0;
  const reasons: string[] = [];
  if (activeClaims > 0) {
    score += 40;
    reasons.push(`${activeClaims} yêu cầu gọi bảo lãnh đang xử lý`);
  }
  if (bg.extensionRequested) {
    score += 30;
    reasons.push('Cần gia hạn');
  }
  if (daysUntilExpiry <= 14) {
    score += 25;
    reasons.push(daysUntilExpiry < 0 ? 'Đã hết hạn' : `Hết hạn còn ${daysUntilExpiry} ngày`);
  }
  if (bg.amount >= 5_000_000_000) score += 10;

  return { bgNumber: bg.bgNumber, score, level: deriveRiskLevel(score), reasons, daysUntilExpiry, activeClaims };
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
}

/** Combines the LC/guarantee/collection exposure the Tool Layer already summed per
 * currency into one report — still per-currency, never converted (spec §31/§46). */
export function combineExposure(parts: { currency: string; amount: number }[][]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const part of parts) {
    for (const { currency, amount } of part) totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}
