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
  /** Key of the deterministic rule (see rules/recommendation-rules.ts) that decides
   * whether this recommendation is currently eligible, evaluated against live account/transaction data. */
  ruleKey: string;
}

export interface RmMessages {
  greetings: string[];
  fallback: string[];
  suggestedQuestions: string[];
}
