// Phase 7 — Trade Finance dedicated Business Banking screens (LC / Bank Guarantee /
// Documentary Collection). These REST endpoints are the "system of record" surface the
// spec calls for: real GET/POST APIs the dedicated screens read from directly, separate
// from the chat query API (server/src/controllers/semantic.controller.ts) that still
// powers Virtual RM's conversational answers over the exact same underlying data.
import {
  bankGuaranteesRepository,
  collectionsRepository,
  creditLimitsRepository,
  letterOfCreditsRepository,
} from '../repositories';
import {
  BankGuarantee,
  Collection,
  CollectionDirection,
  CollectionSubType,
  CreditLimit,
  GuaranteeSubType,
  LcSubType,
  LetterOfCredit,
} from '../models';
import { calculateGuaranteeRisk, calculateLcRisk, combineExposure, CurrencyTotal, daysUntil } from '../calculation/financial-calculations';
import { getAnchorDates } from './transactions.service';

const OPEN_LC_STATUSES = new Set(['ACTIVE', 'DOCUMENT_PENDING', 'DISCREPANCY', 'PENDING_APPROVAL']);
const OPEN_GUARANTEE_STATUSES = new Set(['ACTIVE', 'CLAIMED', 'PENDING_APPROVAL']);
const OPEN_COLLECTION_STATUSES = new Set(['PROCESSING', 'AWAITING_PAYMENT', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'OVERDUE']);

const EXPIRY_WINDOW_DAYS = 30;

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

export interface TradeFinanceSummary {
  lc: TradeFinanceStatCard;
  guarantee: TradeFinanceStatCard;
  collection: TradeFinanceStatCard;
  risk: { highPriority: number; expiringSoon: number; missingDocuments: number; overdue: number };
  exposure: { lc: CurrencyTotal[]; guarantee: CurrencyTotal[]; collection: CurrencyTotal[]; total: CurrencyTotal[] };
  limit?: CreditLimit;
}

function outstandingByCurrency<T>(items: T[], currency: (i: T) => string, amount: (i: T) => number): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(currency(item), (totals.get(currency(item)) ?? 0) + amount(item));
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

export const tradeFinanceService = {
  // ---- Letters of Credit -----------------------------------------------------------------
  listLc(): LetterOfCredit[] {
    return letterOfCreditsRepository.readAll();
  },
  getLc(lcNumber: string): LetterOfCredit | undefined {
    return letterOfCreditsRepository.readAll().find((l) => l.lcNumber === lcNumber);
  },
  createLc(input: {
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
  }): LetterOfCredit {
    const items = letterOfCreditsRepository.readAll();
    const seq = items.length + 1;
    const year = new Date().getUTCFullYear();
    const lcNumber = `LC-${year}-${String(900 + seq).padStart(3, '0')}`;
    const today = getAnchorDates().today;
    const record: LetterOfCredit = {
      id: `lc-req-${Date.now()}`,
      lcNumber,
      type: input.type,
      subType: input.subType,
      referenceNo: `MSB-${lcNumber}`,
      beneficiary: input.beneficiary,
      applicant: input.applicant ?? 'ABC Manufacturing JSC',
      amount: input.amount,
      currency: input.currency,
      issueDate: today,
      expiryDate: input.expiryDate,
      status: 'PENDING_APPROVAL',
      issuingBank: input.issuingBank ?? 'MSB',
      advisingBank: input.advisingBank ?? '—',
      latestShipmentDate: input.latestShipmentDate,
      presentationPeriodDays: 21,
      paymentTerm: input.subType === 'SIGHT' ? 'SIGHT' : 'USANCE',
      availableWith: 'Nominated Bank',
      outstandingAmount: 0,
      documents: (input.requiredDocuments ?? []).map((documentType) => ({
        documentType,
        required: true,
        received: false,
        status: 'MISSING' as const,
      })),
      discrepancies: [],
      amendments: [],
      riskFlags: [],
    };
    letterOfCreditsRepository.writeAll([...items, record]);
    return record;
  },

  // ---- Bank Guarantees --------------------------------------------------------------------
  listGuarantees(): BankGuarantee[] {
    return bankGuaranteesRepository.readAll();
  },
  getGuarantee(bgNumber: string): BankGuarantee | undefined {
    return bankGuaranteesRepository.readAll().find((g) => g.bgNumber === bgNumber);
  },
  createGuarantee(input: {
    type: GuaranteeSubType;
    beneficiary: string;
    applicant?: string;
    currency: string;
    amount: number;
    expiryDate: string;
  }): BankGuarantee {
    const items = bankGuaranteesRepository.readAll();
    const seq = items.length + 1;
    const year = new Date().getUTCFullYear();
    const bgNumber = `BG-${year}-${String(900 + seq).padStart(3, '0')}`;
    const today = getAnchorDates().today;
    const record: BankGuarantee = {
      id: `bg-req-${Date.now()}`,
      bgNumber,
      type: input.type,
      beneficiary: input.beneficiary,
      applicant: input.applicant ?? 'ABC Manufacturing JSC',
      amount: input.amount,
      currency: input.currency,
      issueDate: today,
      expiryDate: input.expiryDate,
      status: 'PENDING_APPROVAL',
      outstandingAmount: 0,
      extensionRequested: false,
      documents: [],
      claims: [],
      riskFlags: [],
    };
    bankGuaranteesRepository.writeAll([...items, record]);
    return record;
  },

  // ---- Documentary Collections ------------------------------------------------------------
  listCollections(): Collection[] {
    return collectionsRepository.readAll();
  },
  getCollection(collectionNumber: string): Collection | undefined {
    return collectionsRepository.readAll().find((c) => c.collectionNumber === collectionNumber);
  },
  createCollection(input: {
    type: 'IMPORT' | 'EXPORT';
    subType: CollectionSubType;
    direction: CollectionDirection;
    drawer: string;
    drawee: string;
    currency: string;
    amount: number;
    dueDate: string;
  }): Collection {
    const items = collectionsRepository.readAll();
    const seq = items.length + 1;
    const year = new Date().getUTCFullYear();
    const collectionNumber = `COL-${year}-${String(900 + seq).padStart(3, '0')}`;
    const record: Collection = {
      id: `col-req-${Date.now()}`,
      collectionNumber,
      type: input.type,
      subType: input.subType,
      direction: input.direction,
      counterparty: input.direction === 'INWARD' ? input.drawer : input.drawee,
      drawer: input.drawer,
      drawee: input.drawee,
      amount: input.amount,
      currency: input.currency,
      dueDate: input.dueDate,
      status: 'PROCESSING',
      documents: [],
    };
    collectionsRepository.writeAll([...items, record]);
    return record;
  },

  // ---- Dashboard summary --------------------------------------------------------------------
  summary(): TradeFinanceSummary {
    const anchorToday = getAnchorDates().today;
    const lcs = letterOfCreditsRepository.readAll();
    const guarantees = bankGuaranteesRepository.readAll();
    const collections = collectionsRepository.readAll();
    const limit = creditLimitsRepository.readAll().find((c) => c.limitType === 'TRADE_FINANCE');

    const openLcs = lcs.filter((l) => OPEN_LC_STATUSES.has(l.status));
    const openGuarantees = guarantees.filter((g) => OPEN_GUARANTEE_STATUSES.has(g.status));
    const openCollections = collections.filter((c) => OPEN_COLLECTION_STATUSES.has(c.status));

    const lcRisk = lcs.map((l) => ({ lc: l, risk: calculateLcRisk(l, anchorToday) }));
    const guaranteeRisk = guarantees.map((g) => ({ guarantee: g, risk: calculateGuaranteeRisk(g, anchorToday) }));

    const lcExpiringSoon = openLcs.filter((l) => daysUntil(l.expiryDate, anchorToday) <= EXPIRY_WINDOW_DAYS).length;
    const lcPendingDocuments = openLcs.filter((l) => l.documents.some((d) => d.status === 'MISSING' || d.status === 'PENDING')).length;
    const lcDiscrepancy = openLcs.filter((l) => l.status === 'DISCREPANCY' || l.discrepancies.some((d) => d.status === 'OPEN')).length;

    const guaranteeExpiringSoon = openGuarantees.filter((g) => daysUntil(g.expiryDate, anchorToday) <= EXPIRY_WINDOW_DAYS).length;
    const guaranteePendingApproval = openGuarantees.filter((g) => g.status === 'PENDING_APPROVAL').length;
    const guaranteeClaims = openGuarantees.filter((g) => g.claims.some((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW')).length;

    const collectionAwaitingPayment = openCollections.filter((c) => c.status === 'AWAITING_PAYMENT').length;
    const collectionAwaitingAcceptance = openCollections.filter((c) => c.status === 'AWAITING_ACCEPTANCE').length;
    const collectionOverdue = openCollections.filter((c) => c.status === 'OVERDUE').length;

    const lcExposure = outstandingByCurrency(openLcs, (l) => l.currency, (l) => l.outstandingAmount);
    const guaranteeExposure = outstandingByCurrency(openGuarantees, (g) => g.currency, (g) => g.outstandingAmount);
    const collectionExposure = outstandingByCurrency(openCollections, (c) => c.currency, (c) => c.amount);

    const highPriority =
      lcRisk.filter((r) => r.risk.level === 'HIGH').length + guaranteeRisk.filter((r) => r.risk.level === 'HIGH').length;

    return {
      lc: {
        active: openLcs.length,
        totalOutstanding: lcExposure,
        expiringSoon: lcExpiringSoon,
        pendingDocuments: lcPendingDocuments,
        discrepancy: lcDiscrepancy,
      },
      guarantee: {
        active: openGuarantees.length,
        totalOutstanding: guaranteeExposure,
        expiringSoon: guaranteeExpiringSoon,
        pendingApproval: guaranteePendingApproval,
        claims: guaranteeClaims,
      },
      collection: {
        active: openCollections.length,
        totalOutstanding: collectionExposure,
        expiringSoon: 0,
        awaitingPayment: collectionAwaitingPayment,
        awaitingAcceptance: collectionAwaitingAcceptance,
        overdue: collectionOverdue,
      },
      risk: {
        highPriority,
        expiringSoon: lcExpiringSoon + guaranteeExpiringSoon,
        missingDocuments: lcPendingDocuments,
        overdue: collectionOverdue,
      },
      exposure: {
        lc: lcExposure,
        guarantee: guaranteeExposure,
        collection: collectionExposure,
        total: combineExposure([lcExposure, guaranteeExposure, collectionExposure]),
      },
      limit,
    };
  },
};
