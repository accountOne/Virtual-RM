// Phase 7 — dedicated Trade Finance Business Banking screens. Mirrors
// server/src/models/index.ts's LetterOfCredit/BankGuarantee/Collection shapes exactly (same
// field names) so records from /api/trade-finance/* can be used as-is, no mapping layer.

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
  latestShipmentDate: string;
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

export interface CurrencyTotal {
  currency: string;
  amount: number;
}

export interface TradeFinanceStatCard {
  active: number;
  totalOutstanding: CurrencyTotal[];
  expiringSoon: number;
  pendingDocuments?: number;
  discrepancy?: number;
  pendingApproval?: number;
  claims?: number;
  awaitingPayment?: number;
  awaitingAcceptance?: number;
  overdue?: number;
}

export interface CreditLimit {
  id: string;
  limitType: string;
  totalLimit: number;
  usedAmount: number;
  availableAmount: number;
  currency: string;
  reviewDate: string;
}

export interface TradeFinanceSummary {
  lc: TradeFinanceStatCard;
  guarantee: TradeFinanceStatCard;
  collection: TradeFinanceStatCard;
  risk: { highPriority: number; expiringSoon: number; missingDocuments: number; overdue: number };
  exposure: { lc: CurrencyTotal[]; guarantee: CurrencyTotal[]; collection: CurrencyTotal[]; total: CurrencyTotal[] };
  limit?: CreditLimit;
}

export interface CreateLcRequest {
  type: 'IMPORT' | 'EXPORT';
  subType: LcSubType;
  beneficiary: string;
  applicant?: string;
  currency: string;
  amount: number;
  issuingBank?: string;
  advisingBank?: string;
  latestShipmentDate: string;
  expiryDate: string;
  requiredDocuments?: string[];
}

export interface CreateGuaranteeRequest {
  type: GuaranteeSubType;
  beneficiary: string;
  applicant?: string;
  currency: string;
  amount: number;
  expiryDate: string;
}

export interface CreateCollectionRequest {
  type: 'IMPORT' | 'EXPORT';
  subType: CollectionSubType;
  direction: CollectionDirection;
  drawer: string;
  drawee: string;
  currency: string;
  amount: number;
  dueDate: string;
}
