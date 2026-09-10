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

// ---------------------------------------------------------------------------
// Business Banking Semantic Pack — supporting datasets (see /business-semantics)
// ---------------------------------------------------------------------------

export type PaymentOrderType = 'SINGLE_TRANSFER' | 'BATCH_TRANSFER' | 'INTERNAL' | 'INTERBANK' | 'FX_PAYMENT';
export type PaymentOrderStatus = 'PENDING_APPROVAL' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';

export interface PaymentOrder {
  id: string;
  /** Links back to the underlying ledger entry in transactions.json, once one exists. */
  transactionId: string | null;
  type: PaymentOrderType;
  initiatedBy: string;
  initiatedAt: string;
  amount: number;
  currency: string;
  beneficiary: string;
  status: PaymentOrderStatus;
  description: string;
}

export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRecord {
  id: string;
  paymentOrderId: string;
  approverUserId: string | null;
  decision: ApprovalDecision;
  decidedAt: string | null;
}

export type PayrollStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED';

export interface Payroll {
  id: string;
  period: string;
  employeeCount: number;
  totalAmount: number;
  currency: string;
  status: PayrollStatus;
  payDate: string;
}

export interface FxRate {
  currency: string;
  buy: number;
  sell: number;
  asOf: string;
}

export type FxDealSide = 'BUY' | 'SELL';

export interface FxDeal {
  id: string;
  date: string;
  currency: string;
  side: FxDealSide;
  amount: number;
  vndEquivalent: number;
  counterparty: string;
}

export type TradeFinanceStatus = 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'CANCELLED' | 'PROCESSING' | 'OVERDUE';

export interface LetterOfCredit {
  id: string;
  lcNumber: string;
  type: 'IMPORT' | 'EXPORT';
  beneficiary: string;
  amount: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  status: TradeFinanceStatus;
}

export interface BankGuarantee {
  id: string;
  bgNumber: string;
  type: 'BID_BOND' | 'PERFORMANCE_BOND' | 'PAYMENT_GUARANTEE' | 'ADVANCE_PAYMENT';
  beneficiary: string;
  amount: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  status: TradeFinanceStatus;
}

export interface Collection {
  id: string;
  collectionNumber: string;
  type: 'IMPORT' | 'EXPORT';
  counterparty: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: TradeFinanceStatus;
}

export type LoanStatus = 'ACTIVE' | 'OVERDUE' | 'COMPLETED';

export interface Loan {
  id: string;
  loanNumber: string;
  purpose: string;
  principal: number;
  outstanding: number;
  currency: string;
  interestRate: number;
  disbursedDate: string;
  maturityDate: string;
  status: LoanStatus;
}

export interface CreditLimit {
  id: string;
  limitType: 'OVERALL' | 'WORKING_CAPITAL' | 'TRADE_FINANCE';
  totalLimit: number;
  usedAmount: number;
  availableAmount: number;
  currency: string;
  reviewDate: string;
}

export type ReceivableStatus = 'EXPECTED' | 'OVERDUE' | 'RECEIVED';

export interface Receivable {
  id: string;
  customer: string;
  amount: number;
  currency: string;
  expectedDate: string;
  status: ReceivableStatus;
  relatedInvoice: string;
}

export type PayableStatus = 'SCHEDULED' | 'OVERDUE' | 'PAID';

export interface Payable {
  id: string;
  supplier: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: PayableStatus;
  relatedInvoice: string;
}
