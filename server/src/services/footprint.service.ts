// Phase 5.5 BRD alignment — "Dấu ấn cá nhân/doanh nghiệp" (Personal/Business Footprint), a
// shareable/downloadable summary of a customer/user's engagement with IBMB since registration
// (or over the last year/quarter/month). See docs/phase-5.5-footprint.md.
//
// Every number here is computed from real repository data (transactions, payment orders,
// approvals, fx deals, trade finance records) — the only genuinely mock inputs are
// `usageHours` (no real session-duration tracking exists in this demo) and `loyalty.json`
// (no real M-Point/voucher system exists), both called out explicitly below rather than
// silently blended in with the real numbers.

import {
  approvalsRepository,
  bankGuaranteesRepository,
  collectionsRepository,
  customerRepository,
  fxDealsRepository,
  letterOfCreditsRepository,
  loyaltyRepository,
  paymentOrdersRepository,
  transactionsRepository,
  userProfilesRepository,
} from '../repositories';
import { formatShortVnd } from '../utils/currency.util';
import footprintRanking from '../config/footprint-ranking.json';
import { PaymentOrder } from '../models';

export type FootprintScope = 'personal' | 'business';
export type FootprintPeriod = 'year' | 'quarter' | 'month';

export interface FootprintStat {
  label: string;
  value: string;
}

export interface FootprintPerson {
  name: string;
  detail: string;
}

export interface Footprint {
  scope: FootprintScope;
  period: FootprintPeriod;
  name: string;
  rankLabel: string;
  rankMessage: string;
  wishMessage: string;
  sinceLabel: string;
  stats: FootprintStat[];
  /** Business scope only — top counterparties by money received/sent. */
  topPartners?: { received: FootprintPerson[]; sent: FootprintPerson[] };
  /** Both scopes — most-active/most-interacted-with people. */
  topPeople?: FootprintPerson[];
  /** Personal scope only — this user's own largest transactions. */
  topTransactions?: FootprintPerson[];
}

const WISH_MESSAGE = 'Cảm ơn anh/chị đã tin tưởng và đồng hành cùng MSB Business — mong hành trình phía trước sẽ còn nhiều điều thú vị hơn nữa! 🎉';

function periodStartDate(anchorToday: string, period: FootprintPeriod): string {
  const [y, m, d] = anchorToday.split('-').map(Number);
  const monthsBack = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  const start = new Date(Date.UTC(y, m - 1 - monthsBack, d));
  return start.toISOString().slice(0, 10);
}

function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const from = new Date(fromDateOnly.slice(0, 10) + 'T00:00:00Z').getTime();
  const to = new Date(toDateOnly.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function rankFor(scope: FootprintScope, score: number): { label: string; message: string } {
  const tiers = footprintRanking[scope].tiers;
  const tier = tiers.find((t) => score >= t.minScore) ?? tiers[tiers.length - 1];
  return { label: tier.label, message: tier.message };
}

function topN<T>(counts: Map<string, T>, n: number, sortKey: (v: T) => number): [string, T][] {
  return [...counts.entries()].sort((a, b) => sortKey(b[1]) - sortKey(a[1])).slice(0, n);
}

function buildBusinessFootprint(anchorToday: string, period: FootprintPeriod): Footprint {
  const customer = customerRepository.read();
  const periodStart = periodStartDate(anchorToday, period);
  const inPeriod = (dateOnlyOrIso: string) => dateOnlyOrIso.slice(0, 10) >= periodStart && dateOnlyOrIso.slice(0, 10) <= anchorToday;

  const txns = transactionsRepository.readAll().filter((t) => inPeriod(t.date));
  const totalIn = txns.filter((t) => t.type === 'CREDIT').reduce((s, t) => s + t.amount, 0);
  const totalOut = txns.filter((t) => t.type === 'DEBIT').reduce((s, t) => s + t.amount, 0);

  const orders = paymentOrdersRepository.readAll().filter((o) => inPeriod(o.initiatedAt));
  const fxCount = fxDealsRepository.readAll().filter((f) => inPeriod(f.date)).length;
  const creditCount =
    letterOfCreditsRepository.readAll().filter((lc) => inPeriod(lc.issueDate)).length +
    bankGuaranteesRepository.readAll().filter((bg) => inPeriod(bg.issueDate)).length +
    collectionsRepository.readAll().length; // collections have no issue/created date — always counted

  const serviceCounts: Record<string, number> = { 'Chuyển tiền': orders.length, 'Giao dịch ngoại tệ': fxCount, 'Giao dịch tín dụng': creditCount };
  const favoriteService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Chuyển tiền';

  const receivedByPartner = new Map<string, number>();
  const sentByPartner = new Map<string, number>();
  for (const t of txns) {
    const bucket = t.type === 'CREDIT' ? receivedByPartner : sentByPartner;
    bucket.set(t.counterparty, (bucket.get(t.counterparty) ?? 0) + t.amount);
  }
  const topReceived = topN(receivedByPartner, 5, (v) => v).map(([name, amount]) => ({ name, detail: formatShortVnd(amount) }));
  const topSent = topN(sentByPartner, 5, (v) => v).map(([name, amount]) => ({ name, detail: formatShortVnd(amount) }));

  const ordersByUser = new Map<string, number>();
  for (const o of orders) ordersByUser.set(o.initiatedBy, (ordersByUser.get(o.initiatedBy) ?? 0) + 1);
  const topUsers = topN(ordersByUser, 3, (v) => v).map(([userId, count]) => ({ name: userId, detail: `${count} lệnh` }));

  const loyalty = loyaltyRepository.read();
  const registeredDays = daysBetween(customer.registeredAt, anchorToday);

  // Simple, deterministic point-accumulation score — no invented "AI judgment", every point maps
  // to a real observed number. Capped contributions keep one huge outlier from dominating.
  const score = Math.min(
    100,
    Math.round(Math.min(30, txns.length) + Math.min(20, orders.length * 2) + Math.min(15, fxCount * 3) + Math.min(15, creditCount * 3) + Math.min(20, registeredDays / 30)),
  );
  const rank = rankFor('business', score);

  return {
    scope: 'business',
    period,
    name: customer.companyName,
    rankLabel: rank.label,
    rankMessage: rank.message,
    wishMessage: WISH_MESSAGE,
    sinceLabel: `Đồng hành cùng MSB Business từ ${customer.registeredAt} (${registeredDays.toLocaleString('vi-VN')} ngày)`,
    stats: [
      { label: 'Tổng tiền vào', value: formatShortVnd(totalIn) },
      { label: 'Tổng tiền ra', value: formatShortVnd(totalOut) },
      { label: 'Tổng số giao dịch', value: String(txns.length) },
      { label: 'Dịch vụ yêu thích nhất', value: favoriteService },
      { label: 'Điểm M-Point tích lũy', value: loyalty.mPoints.toLocaleString('vi-VN') },
      { label: 'Voucher đã đổi', value: String(loyalty.vouchersRedeemed) },
    ],
    topPartners: { received: topReceived, sent: topSent },
    topPeople: topUsers,
  };
}

function buildPersonalFootprint(userId: string, anchorToday: string, period: FootprintPeriod): Footprint {
  const profile = userProfilesRepository.findById(userId);
  const periodStart = periodStartDate(anchorToday, period);
  const inPeriod = (dateOnlyOrIso: string) => dateOnlyOrIso.slice(0, 10) >= periodStart && dateOnlyOrIso.slice(0, 10) <= anchorToday;

  const myOrders = paymentOrdersRepository.readAll().filter((o) => o.initiatedBy === userId && inPeriod(o.initiatedAt));
  const createdCount = myOrders.length;
  const cancelledCount = myOrders.filter((o) => o.status === 'FAILED').length;

  const allApprovals = approvalsRepository.readAll();
  const myDecisions = allApprovals.filter((a) => a.approverUserId === userId && a.decidedAt && inPeriod(a.decidedAt));
  const approvedCount = myDecisions.filter((a) => a.decision === 'APPROVED').length;
  const rejectedCount = myDecisions.filter((a) => a.decision === 'REJECTED').length;

  const orderById = new Map(paymentOrdersRepository.readAll().map((o): [string, PaymentOrder] => [o.id, o]));
  const topTransactions = [...myOrders]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((o) => ({ name: o.beneficiary, detail: formatShortVnd(o.amount) }));

  // Interaction stats — who this user most often exchanged an approve-for/approved-by
  // relationship with (spec's "top 3 người mà user này tương tác nhiều nhất").
  const interactionCounts = new Map<string, number>();
  for (const a of allApprovals) {
    const order = orderById.get(a.paymentOrderId);
    if (!order || !a.approverUserId) continue;
    if (order.initiatedBy === userId && a.approverUserId !== userId) {
      interactionCounts.set(a.approverUserId, (interactionCounts.get(a.approverUserId) ?? 0) + 1);
    } else if (a.approverUserId === userId && order.initiatedBy !== userId) {
      interactionCounts.set(order.initiatedBy, (interactionCounts.get(order.initiatedBy) ?? 0) + 1);
    }
  }
  const topInteractions = topN(interactionCounts, 3, (v) => v).map(([who, count]) => ({ name: who, detail: `${count} lần tương tác` }));

  const usageHours = profile?.usageHours ?? 0;
  const registeredAt = profile?.registeredAt ?? customerRepository.read().registeredAt;
  const registeredDays = daysBetween(registeredAt, anchorToday);

  const score = Math.min(
    100,
    Math.round(Math.min(25, usageHours / 5) + Math.min(25, createdCount * 4) + Math.min(25, (approvedCount + rejectedCount) * 4) + Math.min(25, registeredDays / 20)),
  );
  const rank = rankFor('personal', score);

  return {
    scope: 'personal',
    period,
    name: userId,
    rankLabel: rank.label,
    rankMessage: rank.message,
    wishMessage: WISH_MESSAGE,
    sinceLabel: `Sử dụng MSB Business từ ${registeredAt} (${registeredDays.toLocaleString('vi-VN')} ngày, ~${usageHours} giờ)`,
    stats: [
      { label: 'Lệnh đã tạo', value: String(createdCount) },
      { label: 'Lệnh đã hủy/lỗi', value: String(cancelledCount) },
      { label: 'Lệnh đã duyệt', value: String(approvedCount) },
      { label: 'Lệnh đã từ chối', value: String(rejectedCount) },
      { label: 'Giờ sử dụng (ước tính)', value: `${usageHours} giờ` },
    ],
    topPeople: topInteractions.length > 0 ? topInteractions : undefined,
    topTransactions: topTransactions.length > 0 ? topTransactions : undefined,
  };
}

export function buildFootprint(scope: FootprintScope, userId: string, anchorToday: string, period: FootprintPeriod): Footprint {
  return scope === 'business' ? buildBusinessFootprint(anchorToday, period) : buildPersonalFootprint(userId, anchorToday, period);
}
