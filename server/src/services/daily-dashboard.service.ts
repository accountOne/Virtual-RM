// Phase 5.5 BRD alignment — Daily Dashboard (docs/phase-5.5-brd-gap-analysis.md §4 item 1).
// A Virtual RM *business briefing*, not a generic dashboard: greeting + cashflow + ranked
// pending approvals + tasks + top-3 cross-domain urgent items, all built from the existing
// Reasoning Engine primitives (Priority Engine, Calculation Engine) rather than the legacy
// rm.service.ts/rules/intent-engine.ts path the gap analysis found disconnected from them.
//
// This is a standing summary (like businessBriefing()/tradeFinanceBriefing() in
// semantic-engine.ts), not a chat answer — it never goes through the Model Router or
// runReasoning(); it composes the same underlying tools/engines directly, the same
// relationship the two existing briefings already have to the Reasoning Engine.

import { accountsRepository, alertsRepository, customerRepository, transactionsRepository } from '../repositories';
import { getCollectionDeadlines, getGuaranteeDeadlines, getLcDeadlines, getPayables, getPendingApprovals, getTasks } from '../tools';
import { calculateNetCashflow } from '../calculation/financial-calculations';
import { crossDomainPriorities, ENTITY_NAV_TARGET, ENTITY_SCOPED_NAV_TYPES } from '../reasoning/priority-engine';
import { APPROVAL_EXPIRY_WARNING_DAYS, rankPendingApprovals, RankedApproval } from '../reasoning/approval-risk';
import { UserContext } from '../ai/types';
import { formatShortVnd } from '../utils/currency.util';
import { isWithinRange } from '../semantic/date-resolver';
import { NavigationActionDef } from '../semantic/types';
import { Task } from '../models';

export type TimeOfDay = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface Greeting {
  timeOfDay: TimeOfDay;
  message: string;
}

export interface CashflowSummary {
  period: 'TODAY';
  currentBalance: number;
  totalIncoming: number;
  totalOutgoing: number;
  net: number;
  insight: string;
}

export interface ApprovalSummary {
  count: number;
  totalAmount: number;
  items: RankedApproval[];
}

export interface TaskSummary {
  openCount: number;
  items: Task[];
}

export interface NavigationAction {
  type: 'NAVIGATE';
  route: string;
  entityType?: string;
  entityId?: string;
  label: string;
}

export type DashboardPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface PriorityTask {
  id: string;
  title: string;
  priority: DashboardPriority;
  dueDate?: string;
  reason: string;
  navigation?: NavigationAction;
}

export interface Insight {
  message: string;
}

export interface DailyDashboard {
  greeting: Greeting;
  cashflow: CashflowSummary;
  pendingApprovals: ApprovalSummary;
  tasks: TaskSummary;
  urgentItems: PriorityTask[];
  insights: Insight[];
  navigation: NavigationAction[];
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(dateOnly.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `Date.getHours()` reads the JS runtime's own local timezone — UTC on Render, not Vietnam's —
 * so a customer opening the app at 13:00 ICT (06:00 UTC) got "Chào buổi sáng" instead of "buổi
 * chiều" in production (confirmed live). Vietnam (ICT) is a fixed UTC+7 with no DST, so shifting
 * the UTC epoch by 7 hours before reading the UTC hour gives the correct Vietnam-local hour
 * regardless of the server's own timezone. */
export function timeOfDayNow(now: Date): TimeOfDay {
  const vnHour = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
  if (vnHour < 12) return 'MORNING';
  if (vnHour < 18) return 'AFTERNOON';
  return 'EVENING';
}

const GREETING_PREFIX: Record<TimeOfDay, string> = {
  MORNING: '☀️ Chào buổi sáng',
  AFTERNOON: '🌤️ Chào buổi chiều',
  EVENING: '🌙 Chào buổi tối',
};

function buildGreeting(companyName: string, urgentCount: number, expiringApprovalCount: number, openTaskCount: number, now: Date): Greeting {
  const timeOfDay = timeOfDayNow(now);
  const parts = [`${GREETING_PREFIX[timeOfDay]}, ${companyName}.`];
  const bits: string[] = [];
  if (urgentCount > 0) bits.push(`${urgentCount} việc cần ưu tiên`);
  if (openTaskCount > 0) bits.push(`${openTaskCount} việc cần xử lý`);
  if (expiringApprovalCount > 0) bits.push(`${expiringApprovalCount} lệnh sắp hết hạn duyệt`);
  parts.push(bits.length > 0 ? `Hôm nay công ty có ${bits.join(', ')}.` : 'Hôm nay mọi việc đều ổn định, không có việc gì cần gấp.');
  return { timeOfDay, message: parts.join(' ') };
}

function buildCashflow(anchorToday: string): CashflowSummary {
  const range = { from: anchorToday, to: anchorToday };
  const todayTxns = transactionsRepository.readAll().filter((t) => isWithinRange(t.date, range));
  const net = calculateNetCashflow(todayTxns);
  const currentBalance = accountsRepository
    .readAll()
    .filter((a) => a.currency === 'VND')
    .reduce((s, a) => s + a.balance, 0);

  // "chủ yếu nhờ X" only when one category genuinely dominates today's incoming (spec §8:
  // "Only make the statement if mock data supports it") — never asserted when incoming is spread
  // thinly across several categories or there's no incoming at all.
  const incomingByCategory = new Map<string, number>();
  for (const t of todayTxns.filter((t) => t.type === 'CREDIT')) {
    incomingByCategory.set(t.category, (incomingByCategory.get(t.category) ?? 0) + t.amount);
  }
  const topCategory = [...incomingByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const driverClause = topCategory && net.incoming > 0 && topCategory[1] / net.incoming >= 0.5 ? `, chủ yếu từ "${topCategory[0]}"` : '';

  const insight =
    net.net === 0
      ? 'Dòng tiền hôm nay cân bằng, tiền vào và tiền ra tương đương nhau.'
      : `Dòng tiền hôm nay đang ${net.net > 0 ? 'dương' : 'âm'} ${formatShortVnd(Math.abs(net.net))}${driverClause}.`;

  return { period: 'TODAY', currentBalance, totalIncoming: net.incoming, totalOutgoing: net.outgoing, net: net.net, insight };
}

function buildApprovalSummary(ctx: UserContext, anchorToday: string): ApprovalSummary {
  const pending = getPendingApprovals.execute(ctx, {});
  const items = rankPendingApprovals(pending, anchorToday);
  return { count: items.length, totalAmount: items.reduce((s, i) => s + i.amount, 0), items };
}

function buildTaskSummary(ctx: UserContext): TaskSummary {
  const items = getTasks.execute(ctx, {});
  return { openCount: items.length, items };
}

function priorityLevel(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): DashboardPriority {
  return level === 'CRITICAL' ? 'URGENT' : level;
}

function navigationFor(navigationActions: NavigationActionDef[], entityType: string, entityId: string, role?: string): NavigationAction | undefined {
  let navId = ENTITY_NAV_TARGET[entityType];
  if (!navId) return undefined;
  // OPEN_APPROVAL (/payments/approval) is CHECKER/ADMIN-only — app.routes.ts's roleGuard bounces
  // any other role straight back to /dashboard (confirmed live: a MAKER clicking an "urgent
  // approval" item this way just landed on the dashboard, no error, no explanation). A MAKER
  // can't approve anyway (maker-checker segregation of duties), so point them at the one
  // payments view they *can* actually see instead of a link that silently goes nowhere useful.
  if (navId === 'OPEN_APPROVAL' && role !== 'CHECKER' && role !== 'ADMIN') {
    navId = 'OPEN_PAYMENT';
  }
  const nav = navigationActions.find((n) => n.id === navId);
  if (!nav) return undefined;
  return {
    type: 'NAVIGATE',
    route: nav.route,
    entityType,
    entityId: ENTITY_SCOPED_NAV_TYPES.has(entityType) ? entityId : undefined,
    label: nav.labelVi,
  };
}

/** Builds the full Daily Dashboard (spec §6) for one user/company. `navigationActions` is the
 * loaded business-semantics navigation-actions.json pack, passed in (same convention as
 * reasoning-engine.ts's `runReasoning`) rather than re-loaded here. */
export function buildDailyDashboard(ctx: UserContext, anchorToday: string, navigationActions: NavigationActionDef[]): DailyDashboard {
  const customer = customerRepository.read();
  const alerts = alertsRepository.readAll();

  const approvals = buildApprovalSummary(ctx, anchorToday);
  const tasks = buildTaskSummary(ctx);
  const cashflow = buildCashflow(anchorToday);

  const next30 = { from: anchorToday, to: addDays(anchorToday, 30) };
  const lcs = getLcDeadlines.execute(ctx, {});
  const guarantees = getGuaranteeDeadlines.execute(ctx, {});
  const collections = getCollectionDeadlines.execute(ctx, {});
  const payables = getPayables.execute(ctx, { range: next30 });
  const pendingApprovalRaw = getPendingApprovals.execute(ctx, {});

  const ranked = crossDomainPriorities({
    tasks: tasks.items,
    pendingApprovals: pendingApprovalRaw,
    payables,
    lcs,
    guarantees,
    collections,
    anchorToday,
  });
  const top3 = ranked.slice(0, 3);

  const urgentItems: PriorityTask[] = top3.map((item) => ({
    id: item.entityId,
    title: item.label,
    priority: priorityLevel(item.priority),
    reason: item.reasons.join('; '),
    navigation: navigationFor(navigationActions, item.entityType, item.entityId, ctx.role),
  }));

  const expiringApprovalCount = approvals.items.filter((a) => a.expiringSoon).length;
  const greeting = buildGreeting(customer.companyName, top3.length, expiringApprovalCount, tasks.openCount, new Date());

  const insights: Insight[] = [{ message: cashflow.insight }];
  if (expiringApprovalCount > 0) {
    insights.push({
      message: `${expiringApprovalCount} lệnh chờ duyệt sắp hết hạn (còn dưới ${APPROVAL_EXPIRY_WARNING_DAYS} ngày) — nên xử lý sớm để tránh phải lập lại.`,
    });
  }
  if (alerts.length > 0) {
    insights.push({ message: `Có ${alerts.length} cảnh báo đang mở cần anh/chị xem qua.` });
  }

  const navigation: NavigationAction[] = [
    navFor(navigationActions, 'OPEN_APPROVAL', 'Xem lệnh chờ duyệt'),
    navFor(navigationActions, 'OPEN_TASK', 'Xem việc cần làm'),
    navFor(navigationActions, 'OPEN_DASHBOARD', 'Về Dashboard'),
  ].filter((n): n is NavigationAction => !!n);

  return { greeting, cashflow, pendingApprovals: approvals, tasks, urgentItems, insights, navigation };
}

function navFor(navigationActions: NavigationActionDef[], navId: string, labelOverride?: string): NavigationAction | undefined {
  const nav = navigationActions.find((n) => n.id === navId);
  if (!nav) return undefined;
  return { type: 'NAVIGATE', route: nav.route, label: labelOverride ?? nav.labelVi };
}
