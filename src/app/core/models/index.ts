export interface Customer {
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  rmName: string;
  rmContact: string;
  segment: string;
}

export interface Account {
  id: string;
  accountNumber: string;
  accountName: string;
  currency: string;
  balance: number;
  availableBalance: number;
  type: string;
}

export type TransactionType = 'CREDIT' | 'DEBIT';
export type TransactionStatus = 'COMPLETED' | 'PENDING_APPROVAL' | 'REJECTED';

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  currency: string;
  counterparty: string;
  description: string;
  status: TransactionStatus;
}

export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskStatus = 'OPEN' | 'COMPLETED';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  status: TaskStatus;
  actionLabel: string;
  actionLink: string;
  meta?: { count?: number; amount?: number; currency?: string };
}

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  date: string;
  actionLabel: string;
  actionLink: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  cta: string;
  ctaLink: string;
  eligibility: string;
}

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  productId: string;
  cta: string;
  ctaLink: string;
  priority: TaskPriority;
  ruleKey: string;
}

export interface Briefing {
  greeting: string;
  companyName: string;
  rmName: string;
  todayLabel: string;
  balance: number;
  balanceShort: string;
  incomingYesterday: number;
  outgoingYesterday: number;
  pendingApprovalCount: number;
  pendingApprovalAmount: number;
  tasksOpenCount: number;
  alertsCount: number;
  insight: { message: string; pctChange: number };
}

export type Intent =
  | 'BALANCE'
  | 'TRANSACTION_SUMMARY'
  | 'LARGEST_TRANSACTION'
  | 'PENDING_APPROVAL'
  | 'INCOMING_PAYMENT'
  | 'OUTGOING_PAYMENT'
  | 'ACCOUNT'
  | 'TASK'
  | 'PRODUCT'
  | 'UNKNOWN';

export interface RmAnswer {
  intent: Intent;
  message: string;
  cta?: { label: string; link: string };
  data?: unknown;
}

export interface ChatMessage {
  id: string;
  from: 'USER' | 'RM';
  text: string;
  cta?: { label: string; link: string };
  timestamp: number;
}
