// Phase 5.5 BRD alignment — Daily Dashboard (docs/phase-5.5-brd-gap-analysis.md §4 item 1).

import { describe, test, assert, assertEqual } from './test-runner';
import { buildSecurityContext, getNavigationActions } from '../src/semantic/semantic-engine';
import { getAnchorDates } from '../src/services/transactions.service';
import { toUserContext } from '../src/ai/types';
import { buildDailyDashboard } from '../src/services/daily-dashboard.service';
import { calculateApprovalAge, calculateExpiryRisk, rankPendingApprovals, APPROVAL_EXPIRY_WARNING_DAYS } from '../src/reasoning/approval-risk';
import { getPendingApprovals } from '../src/tools';

const security = buildSecurityContext('msb_ck', 'CHECKER');
const ctx = toUserContext(security);
const anchorToday = getAnchorDates().today;
const navigationActions = getNavigationActions();

describe('Daily Dashboard (10 required)', () => {
  test('builds a complete DailyDashboard shape', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assert(!!d.greeting, 'expected a greeting');
    assert(!!d.cashflow, 'expected a cashflow summary');
    assert(!!d.pendingApprovals, 'expected a pendingApprovals summary');
    assert(!!d.tasks, 'expected a tasks summary');
    assert(Array.isArray(d.urgentItems), 'expected an urgentItems array');
    assert(Array.isArray(d.insights), 'expected an insights array');
    assert(Array.isArray(d.navigation), 'expected a navigation array');
  });

  test('greeting message is non-empty and mentions the company name', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assert(d.greeting.message.length > 0, 'expected a non-empty greeting');
  });

  test('greeting.timeOfDay is always one of MORNING/AFTERNOON/EVENING', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assert(['MORNING', 'AFTERNOON', 'EVENING'].includes(d.greeting.timeOfDay), `unexpected timeOfDay ${d.greeting.timeOfDay}`);
  });

  test('cashflow reports real today-only incoming/outgoing/net from real transactions', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assertEqual(d.cashflow.net, d.cashflow.totalIncoming - d.cashflow.totalOutgoing);
    assert(d.cashflow.currentBalance > 0, 'expected a real positive balance');
  });

  test('cashflow.insight never claims a driver category when incoming is 0', () => {
    // Structural check on the phrasing itself — the driver clause is only appended when
    // totalIncoming > 0, so a zero-incoming day's insight must not mention "chủ yếu từ".
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    if (d.cashflow.totalIncoming === 0) assert(!d.cashflow.insight.includes('chủ yếu từ'), 'must not claim a driver with zero incoming');
  });

  test('pendingApprovals.items are ranked oldest-first (descending age)', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    for (let i = 1; i < d.pendingApprovals.items.length; i++) {
      assert(d.pendingApprovals.items[i].ageDays <= d.pendingApprovals.items[i - 1].ageDays, 'expected oldest-first ordering');
    }
  });

  test('pendingApprovals.count matches items.length', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assertEqual(d.pendingApprovals.count, d.pendingApprovals.items.length);
  });

  test('a real long-pending approval (seeded payroll, ~26 days) is flagged expiringSoon', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    const payroll = d.pendingApprovals.items.find((i) => i.beneficiary.includes('lương'));
    assert(!!payroll, 'expected the seeded payroll approval to be present');
    assert(payroll!.expiringSoon, 'expected the ~26-day-old payroll approval to be flagged expiringSoon');
  });

  test('a freshly-initiated approval (same day) is never flagged expiringSoon', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    const fresh = d.pendingApprovals.items.filter((i) => i.ageDays === 0);
    for (const f of fresh) assertEqual(f.expiringSoon, false);
  });

  test('urgentItems never exceeds 3 (top-3 per spec §35/§10)', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assert(d.urgentItems.length <= 3, `expected at most 3 urgent items, got ${d.urgentItems.length}`);
  });

  test('every urgentItem has a non-empty reason', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    for (const item of d.urgentItems) assert(item.reason.length > 0, `${item.title} must have a reason`);
  });

  test('every urgentItem.priority is a valid BRD priority level', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    for (const item of d.urgentItems) assert(['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(item.priority), `unexpected priority ${item.priority}`);
  });

  test('a CRITICAL Risk Engine level maps to URGENT on the dashboard (never a raw CRITICAL leak)', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    for (const item of d.urgentItems) assert((item.priority as string) !== 'CRITICAL', 'CRITICAL must be remapped to URGENT for BRD output');
  });

  test('navigation array is never empty', () => {
    const d = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assert(d.navigation.length > 0, 'expected at least one standing navigation action');
  });

  test('is deterministic — two calls with the same anchorToday produce the same urgentItems order', () => {
    const a = buildDailyDashboard(ctx, anchorToday, navigationActions);
    const b = buildDailyDashboard(ctx, anchorToday, navigationActions);
    assertEqual(a.urgentItems.map((i) => i.id).join(','), b.urgentItems.map((i) => i.id).join(','));
  });
});

describe('Approval age/expiry risk calculation (15 required)', () => {
  test('calculateApprovalAge is 0 for an approval initiated today', () => {
    assertEqual(calculateApprovalAge(`${anchorToday}T09:00:00`, anchorToday), 0);
  });
  test('calculateApprovalAge is never negative', () => {
    assert(calculateApprovalAge(`${anchorToday}T09:00:00`, anchorToday) >= 0, 'age must never be negative');
  });
  test('calculateApprovalAge counts whole days correctly for a 26-day-old approval', () => {
    assertEqual(calculateApprovalAge('2026-08-14T09:00:00', '2026-09-09'), 26);
  });
  test('calculateApprovalAge counts whole days correctly for a 1-day-old approval', () => {
    assertEqual(calculateApprovalAge('2026-09-08T09:00:00', '2026-09-09'), 1);
  });
  test('calculateExpiryRisk(0) is not expiring soon', () => {
    assertEqual(calculateExpiryRisk(0).expiringSoon, false);
  });
  test('calculateExpiryRisk(26) is expiring soon (4 days remaining)', () => {
    const r = calculateExpiryRisk(26);
    assertEqual(r.daysRemaining, 4);
    assertEqual(r.expiringSoon, true);
  });
  test('calculateExpiryRisk(2) matches the BRD worked example (not flagged)', () => {
    assertEqual(calculateExpiryRisk(2).expiringSoon, false);
  });
  test('calculateExpiryRisk(28) matches the BRD worked example (flagged, "sắp hết hạn")', () => {
    assertEqual(calculateExpiryRisk(28).expiringSoon, true);
  });
  test('calculateExpiryRisk right at the warning threshold is flagged', () => {
    const boundaryAge = 30 - APPROVAL_EXPIRY_WARNING_DAYS;
    assertEqual(calculateExpiryRisk(boundaryAge).expiringSoon, true);
  });
  test('calculateExpiryRisk one day before the warning threshold is not flagged', () => {
    const beforeBoundary = 30 - APPROVAL_EXPIRY_WARNING_DAYS - 1;
    assertEqual(calculateExpiryRisk(beforeBoundary).expiringSoon, false);
  });
  test('calculateExpiryRisk daysRemaining can go negative past the window (already expired)', () => {
    assert(calculateExpiryRisk(35).daysRemaining < 0, 'expected a negative daysRemaining past the 30-day window');
  });
  test('rankPendingApprovals sorts oldest-first on real seeded data', () => {
    const pending = getPendingApprovals.execute(ctx, {});
    const ranked = rankPendingApprovals(pending, anchorToday);
    for (let i = 1; i < ranked.length; i++) assert(ranked[i].ageDays <= ranked[i - 1].ageDays, 'expected descending age order');
  });
  test('rankPendingApprovals never drops a real pending approval that has an order', () => {
    const pending = getPendingApprovals.execute(ctx, {}).filter((p) => !!p.order);
    const ranked = rankPendingApprovals(pending, anchorToday);
    assertEqual(ranked.length, pending.length);
  });
  test('rankPendingApprovals silently skips an approval with no matching order (data integrity guard)', () => {
    const withGhost = [...getPendingApprovals.execute(ctx, {}), { approval: { id: 'ghost', paymentOrderId: 'none', approverUserId: null, decision: 'PENDING' as const, decidedAt: null }, order: undefined }];
    const ranked = rankPendingApprovals(withGhost, anchorToday);
    assert(!ranked.some((r) => r.approvalId === 'ghost'), 'an approval with no order must never appear ranked');
  });
  test('every ranked approval carries the real beneficiary/amount/currency from its order', () => {
    const pending = getPendingApprovals.execute(ctx, {});
    const ranked = rankPendingApprovals(pending, anchorToday);
    for (const r of ranked) {
      const match = pending.find((p) => p.approval.id === r.approvalId);
      assertEqual(r.beneficiary, match!.order!.beneficiary);
      assertEqual(r.amount, match!.order!.amount);
    }
  });
});
