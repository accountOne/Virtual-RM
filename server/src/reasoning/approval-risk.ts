// Phase 5.5 BRD alignment — Pending Approval age/expiry-risk calculation
// (docs/phase-5.5-brd-gap-analysis.md §4 item 3). Deterministic, no model involved: age is a
// date subtraction, expiry risk is a threshold check against a documented business rule.
//
// This demo's PaymentOrder/ApprovalRecord data has no explicit "approval deadline" field, so the
// expiry window below is an inferred business rule, not invented from nothing — it's sized to
// exactly match the BRD's own worked example (§9: a payment pending 28 days is flagged "sắp hết
// hạn", one pending 2 days is not), which only holds if the window is close to 30 days and the
// warning threshold is a handful of days before it.

import { ApprovalRecord, PaymentOrder } from '../models';

export const APPROVAL_EXPIRY_WINDOW_DAYS = 30;
export const APPROVAL_EXPIRY_WARNING_DAYS = 5;

/** Whole days between an ISO datetime (`initiatedAt`) and the anchor "today" date-only string —
 * always >= 0 for a real pending approval (it was initiated in the past). */
export function calculateApprovalAge(initiatedAt: string, anchorToday: string): number {
  const initiated = new Date(initiatedAt.slice(0, 10) + 'T00:00:00Z').getTime();
  const today = new Date(anchorToday.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((today - initiated) / 86_400_000));
}

export interface ApprovalExpiryRisk {
  daysRemaining: number;
  expiringSoon: boolean;
}

export function calculateExpiryRisk(ageDays: number): ApprovalExpiryRisk {
  const daysRemaining = APPROVAL_EXPIRY_WINDOW_DAYS - ageDays;
  return { daysRemaining, expiringSoon: daysRemaining <= APPROVAL_EXPIRY_WARNING_DAYS };
}

export interface RankedApproval {
  approvalId: string;
  paymentOrderId: string;
  beneficiary: string;
  amount: number;
  currency: string;
  description: string;
  ageDays: number;
  daysRemaining: number;
  expiringSoon: boolean;
}

/** Oldest first (spec §9: "oldest -> newest") — the approval that has been waiting longest, and
 * therefore is closest to the expiry window, leads the list. */
export function rankPendingApprovals(
  items: { approval: ApprovalRecord; order: PaymentOrder | undefined }[],
  anchorToday: string,
): RankedApproval[] {
  return items
    .filter((i): i is { approval: ApprovalRecord; order: PaymentOrder } => !!i.order)
    .map(({ approval, order }) => {
      const ageDays = calculateApprovalAge(order.initiatedAt, anchorToday);
      const risk = calculateExpiryRisk(ageDays);
      return {
        approvalId: approval.id,
        paymentOrderId: order.id,
        beneficiary: order.beneficiary,
        amount: order.amount,
        currency: order.currency,
        description: order.description,
        ageDays,
        daysRemaining: risk.daysRemaining,
        expiringSoon: risk.expiringSoon,
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
}
