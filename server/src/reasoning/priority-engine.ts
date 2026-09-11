// Phase 5.5 Priority Engine (spec §11) — cross-domain "what needs attention" ranking, the
// engine behind DAILY_PRIORITY ("Tôi nên xử lý việc gì quan trọng nhất hôm nay?", golden test
// #5). Distinct from calculation/financial-calculations.ts::rankByUrgency (single-domain,
// amount/due-date only, already used by PAYMENT_PRIORITIZATION/APPROVAL_PRIORITIZATION) — this
// one ranks *across* entity types and returns an explainable reason list per item.
//
// Score = 100 × (urgency × impact × risk × deadlineWeight)^(1/4) — a weighted geometric mean of
// spec §11's four named factors, each already normalized to [0,1]. A straight product collapses
// almost every real item toward 0 (four independent fractions multiply small), which would make
// every score look equally "low priority" and defeat the ranking's purpose; the fourth root
// undoes that compression while preserving the "any factor at zero ⇒ priority at zero" property
// spec's multiplicative formula implies (e.g. an approval with no amount and no deadline truly
// isn't urgent). Documented explicitly here and in docs/phase-5.5-risk-engine.md rather than
// silently deviating from the "×" spec text.

import { ApprovalRecord, Payable, PaymentOrder, Task } from '../models';
import { scoreCollectionRisk, scoreGuaranteeRisk, scoreLcRisk } from './risk-engine';
import { CrossDomainPriorityItem, RiskLevel4 } from './reasoning-types';
import { LetterOfCredit, BankGuarantee, Collection } from '../models';

function daysUntil(dateOnly: string, anchorToday: string): number {
  const target = new Date(dateOnly.slice(0, 10) + 'T00:00:00Z').getTime();
  const today = new Date(anchorToday.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

function urgencyFromDays(daysLeft: number | undefined): number {
  if (daysLeft === undefined) return 0.3;
  if (daysLeft <= 0) return 1;
  if (daysLeft <= 3) return 0.75;
  if (daysLeft <= 7) return 0.5;
  if (daysLeft <= 30) return 0.25;
  return 0.1;
}

const LARGE_AMOUNT_VND = 1_500_000_000;

function impactFromAmount(amount: number): number {
  return Math.min(1, amount / LARGE_AMOUNT_VND);
}

function levelFromScore(score: number): RiskLevel4 {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function combine(urgency: number, impact: number, risk: number, deadlineWeight: number): number {
  const product = Math.max(urgency, 0.01) * Math.max(impact, 0.01) * Math.max(risk, 0.01) * Math.max(deadlineWeight, 0.01);
  return Math.round(100 * Math.pow(product, 1 / 4));
}

export interface PriorityInput {
  tasks: Task[];
  pendingApprovals: { approval: ApprovalRecord; order: PaymentOrder | undefined }[];
  payables: Payable[];
  lcs: LetterOfCredit[];
  guarantees: BankGuarantee[];
  collections: Collection[];
  anchorToday: string;
}

/** Ranks every open item across all six domains and returns them sorted by priorityScore
 * descending. The caller (reasoning-engine.ts) takes the top 3 for the DAILY_PRIORITY answer,
 * per spec §11/§17's own worked example. */
export function crossDomainPriorities(input: PriorityInput): CrossDomainPriorityItem[] {
  const { anchorToday } = input;
  const items: CrossDomainPriorityItem[] = [];

  for (const t of input.tasks) {
    const daysLeft = t.dueDate ? daysUntil(t.dueDate, anchorToday) : undefined;
    const urgency = urgencyFromDays(daysLeft);
    const score = combine(urgency, 0.4, 0.4, t.dueDate ? 0.6 : 0.2);
    items.push({
      entityType: 'Task',
      entityId: t.id,
      label: t.title,
      priorityScore: score,
      priority: levelFromScore(score),
      reasons: [t.dueDate ? `Đến hạn ${t.dueDate}` : 'Chưa có hạn cụ thể', 'Việc cần làm đang mở'],
      recommendedAction: t.title,
    });
  }

  for (const { approval, order } of input.pendingApprovals) {
    if (!order) continue;
    const urgency = 0.6; // pending approvals block money movement — treated as consistently time-sensitive
    const impact = impactFromAmount(order.amount);
    const score = combine(urgency, impact, 0.5, 0.6);
    items.push({
      entityType: 'Approval',
      entityId: approval.id,
      label: `Phê duyệt ${order.beneficiary}`,
      priorityScore: score,
      priority: levelFromScore(score),
      reasons: [`Giá trị ${order.amount.toLocaleString('vi-VN')} ${order.currency}`, 'Đang chờ phê duyệt'],
      recommendedAction: `Xem xét và phê duyệt/từ chối giao dịch ${order.beneficiary}`,
    });
  }

  for (const p of input.payables) {
    const daysLeft = daysUntil(p.dueDate, anchorToday);
    const urgency = urgencyFromDays(daysLeft);
    const impact = impactFromAmount(p.amount);
    const score = combine(urgency, impact, 0.4, urgency);
    if (score < 20) continue; // keep the cross-domain list to genuinely time-sensitive payables
    items.push({
      entityType: 'Payable',
      entityId: p.id,
      label: `Thanh toán ${p.supplier}`,
      priorityScore: score,
      priority: levelFromScore(score),
      reasons: [daysLeft <= 0 ? 'Đã đến/quá hạn thanh toán' : `Còn ${daysLeft} ngày đến hạn`, `Giá trị ${p.amount.toLocaleString('vi-VN')} ${p.currency}`],
      recommendedAction: `Chuẩn bị thanh toán cho ${p.supplier}`,
    });
  }

  for (const lc of input.lcs) {
    const risk = scoreLcRisk(lc, anchorToday);
    if (risk.score === 0) continue;
    const urgency = risk.factors.expiryProximity;
    const impact = risk.factors.outstandingAmount;
    const score = combine(urgency, impact, risk.score / 100, urgency);
    items.push({
      entityType: 'LetterOfCredit',
      entityId: lc.lcNumber,
      label: `LC ${lc.lcNumber}`,
      priorityScore: score,
      priority: levelFromScore(score),
      reasons: risk.reasons,
      recommendedAction: `Rà soát và xử lý LC ${lc.lcNumber}`,
    });
  }

  for (const bg of input.guarantees) {
    const risk = scoreGuaranteeRisk(bg, anchorToday);
    if (risk.score === 0) continue;
    const urgency = risk.factors.expiryProximity;
    const impact = risk.factors.outstandingAmount;
    const score = combine(urgency, impact, risk.score / 100, urgency);
    items.push({
      entityType: 'BankGuarantee',
      entityId: bg.bgNumber,
      label: `Bảo lãnh ${bg.bgNumber}`,
      priorityScore: score,
      priority: levelFromScore(score),
      reasons: risk.reasons,
      recommendedAction: `Rà soát và xử lý bảo lãnh ${bg.bgNumber}`,
    });
  }

  for (const col of input.collections) {
    const risk = scoreCollectionRisk(col, anchorToday);
    if (risk.score === 0) continue;
    const urgency = risk.factors.expiryProximity;
    const impact = risk.factors.outstandingAmount;
    const score = combine(urgency, impact, risk.score / 100, urgency);
    items.push({
      entityType: 'Collection',
      entityId: col.collectionNumber,
      label: `Nhờ thu ${col.collectionNumber}`,
      priorityScore: score,
      priority: levelFromScore(score),
      reasons: risk.reasons,
      recommendedAction: `Rà soát và xử lý nhờ thu ${col.collectionNumber}`,
    });
  }

  return items.sort((a, b) => b.priorityScore - a.priorityScore);
}
