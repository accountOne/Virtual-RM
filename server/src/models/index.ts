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

// Phase 6 (Trade Finance) additive statuses alongside the original 6 — see
// docs/phase-6-semantic-model.md for the full status list and Vietnamese mapping.
export type TradeFinanceStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PROCESSING'
  | 'OVERDUE'
  | 'PENDING_APPROVAL'
  | 'DOCUMENT_PENDING'
  | 'DISCREPANCY'
  | 'CLAIMED'
  | 'AWAITING_PAYMENT'
  | 'AWAITING_ACCEPTANCE'
  | 'ACCEPTED';

export type TradeDocumentStatus = 'RECEIVED' | 'MISSING' | 'PENDING' | 'ACCEPTED' | 'DISCREPANT';

/** Nested on an LC/Guarantee/Collection record rather than a separate top-level file —
 * see docs/phase-6-trade-finance-architecture.md §3 for why. */
export interface TradeDocument {
  documentType: string;
  required: boolean;
  received: boolean;
  status: TradeDocumentStatus;
}

export type DiscrepancyStatus = 'OPEN' | 'WAIVED' | 'REJECTED';

export interface LcDiscrepancy {
  id: string;
  description: string;
  status: DiscrepancyStatus;
  raisedDate: string;
}

export type AmendmentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface TradeAmendment {
  id: string;
  description: string;
  status: AmendmentStatus;
  requestedDate: string;
}

export type ClaimStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'SETTLED' | 'REJECTED';

export interface GuaranteeClaim {
  id: string;
  amount: number;
  status: ClaimStatus;
  claimDate: string;
}

export type LcSubType = 'SIGHT' | 'USANCE' | 'DEFERRED_PAYMENT' | 'TRANSFERABLE' | 'STANDBY';

export interface LetterOfCredit {
  id: string;
  lcNumber: string;
  type: 'IMPORT' | 'EXPORT';
  subType: LcSubType;
  referenceNo: string;
  beneficiary: string;
  applicant: string;
  amount: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  status: TradeFinanceStatus;
  issuingBank: string;
  advisingBank: string;
  /** Latest date shipment must occur by (Incoterms-style deadline the beneficiary must
   * meet), distinct from the LC's own expiryDate. */
  latestShipmentDate: string;
  /** Days after shipment within which documents must be presented (UCP 600 default is
   * 21 unless the LC specifies otherwise). */
  presentationPeriodDays: number;
  paymentTerm: 'SIGHT' | 'USANCE';
  availableWith: string;
  outstandingAmount: number;
  documents: TradeDocument[];
  discrepancies: LcDiscrepancy[];
  amendments: TradeAmendment[];
  riskFlags: string[];
}

export type GuaranteeSubType = 'BID_BOND' | 'PERFORMANCE_BOND' | 'ADVANCE_PAYMENT' | 'PAYMENT_GUARANTEE' | 'WARRANTY' | 'CUSTOMS' | 'TAX' | 'OTHER';

export interface BankGuarantee {
  id: string;
  bgNumber: string;
  type: GuaranteeSubType;
  beneficiary: string;
  applicant: string;
  amount: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  status: TradeFinanceStatus;
  outstandingAmount: number;
  extensionRequested: boolean;
  documents: TradeDocument[];
  claims: GuaranteeClaim[];
  riskFlags: string[];
}

export type CollectionSubType = 'DP' | 'DA';
export type CollectionDirection = 'INWARD' | 'OUTWARD';

export interface Collection {
  id: string;
  collectionNumber: string;
  type: 'IMPORT' | 'EXPORT';
  subType: CollectionSubType;
  direction: CollectionDirection;
  counterparty: string;
  drawer: string;
  drawee: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: TradeFinanceStatus;
  documents: TradeDocument[];
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
