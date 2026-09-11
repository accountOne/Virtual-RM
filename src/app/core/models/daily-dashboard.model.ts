// Phase 5.5 BRD alignment — Daily Dashboard. Mirrors server/src/services/daily-dashboard.service.ts's
// types exactly (same field names/shapes) so the HTTP response maps straight through with no
// transformation layer, same convention trade-finance.model.ts already established.

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

export interface ApprovalSummary {
  count: number;
  totalAmount: number;
  items: RankedApproval[];
}

// `items` is typed loosely here (not `Task[]`) to avoid a circular import with index.ts's own
// barrel re-export of this file — consumers import `Task` directly from `core/models` alongside
// this type, same as trade-finance.model.ts does for its own record types.
export interface DashboardTaskSummary {
  openCount: number;
  items: { id: string; title: string; description: string; priority: string; dueDate: string; actionLabel: string; actionLink: string }[];
}

export type DashboardPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface DashboardNavigationAction {
  type: 'NAVIGATE';
  route: string;
  entityType?: string;
  entityId?: string;
  label: string;
}

export interface PriorityTask {
  id: string;
  title: string;
  priority: DashboardPriority;
  dueDate?: string;
  reason: string;
  navigation?: DashboardNavigationAction;
}

export interface DashboardInsight {
  message: string;
}

export interface DailyDashboard {
  greeting: Greeting;
  cashflow: CashflowSummary;
  pendingApprovals: ApprovalSummary;
  tasks: DashboardTaskSummary;
  urgentItems: PriorityTask[];
  insights: DashboardInsight[];
  navigation: DashboardNavigationAction[];
}
