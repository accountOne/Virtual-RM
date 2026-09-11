// Phase 5.5 Risk Engine (spec §10) — a configurable, weighted, 0-100 risk score, additive to
// the existing calculation/financial-calculations.ts::calculateLcRisk/calculateGuaranteeRisk
// (kept unchanged — Phase 6's response-generator.ts handlers and 385 existing tests depend on
// their exact shape/levels). This engine is the new authority for anything Phase 5.5 adds:
// the cross-domain Priority Engine and the golden "LC nào rủi ro cao nhất" verification path.
//
// Weights/bands live in server/src/config/risk-rules.json, not hard-coded, per spec §10
// ("Không hard-code business policy sâu trong code").

import riskRules from '../config/risk-rules.json';
import { BankGuarantee, Collection, LetterOfCredit } from '../models';
import { RiskLevel4 } from './reasoning-types';

interface RiskWeights {
  expiryProximity: number;
  missingDocuments: number;
  discrepancy: number;
  outstandingAmount: number;
  pendingApproval: number;
}

interface RiskBand {
  level: RiskLevel4;
  min: number;
  max: number;
}

const WEIGHTS: RiskWeights = riskRules.weights;
const BANDS: RiskBand[] = riskRules.bands as RiskBand[];
const THRESHOLDS = riskRules.thresholds;

export interface RiskFactors {
  expiryProximity: number;
  missingDocuments: number;
  discrepancy: number;
  outstandingAmount: number;
  pendingApproval: number;
}

export interface RiskScoreResult {
  entityType: string;
  entityId: string;
  score: number;
  level: RiskLevel4;
  factors: RiskFactors;
  reasons: string[];
}

function daysUntil(dateOnly: string, anchorToday: string): number {
  const target = new Date(dateOnly.slice(0, 10) + 'T00:00:00Z').getTime();
  const today = new Date(anchorToday.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

/** 0 (safe) .. 1 (most urgent) — overdue/expired is 1, within the "urgent" window is 0.8,
 * within the "warning" window is 0.4, otherwise 0. */
function expiryFactor(daysLeft: number): number {
  if (daysLeft <= 0) return 1;
  if (daysLeft <= THRESHOLDS.expiryUrgentDays) return 0.8;
  if (daysLeft <= THRESHOLDS.expiryWarningDays) return 0.4;
  return 0;
}

function amountFactor(amount: number): number {
  return Math.min(1, amount / THRESHOLDS.largeAmountVnd);
}

export function levelFromScore(score: number): RiskLevel4 {
  const band = BANDS.find((b) => score >= b.min && score <= b.max);
  return band?.level ?? 'LOW';
}

function weightedScore(factors: RiskFactors): number {
  const raw =
    factors.expiryProximity * WEIGHTS.expiryProximity +
    factors.missingDocuments * WEIGHTS.missingDocuments +
    factors.discrepancy * WEIGHTS.discrepancy +
    factors.outstandingAmount * WEIGHTS.outstandingAmount +
    factors.pendingApproval * WEIGHTS.pendingApproval;
  return Math.round(Math.min(1, Math.max(0, raw)) * 100);
}

export function scoreLcRisk(lc: LetterOfCredit, anchorToday: string): RiskScoreResult {
  const daysLeft = daysUntil(lc.expiryDate, anchorToday);
  const documentGaps = lc.documents.filter((d) => d.status === 'MISSING' || d.status === 'DISCREPANT' || d.status === 'PENDING').length;
  const openDiscrepancies = lc.discrepancies.filter((d) => d.status === 'OPEN').length;

  const factors: RiskFactors = {
    expiryProximity: expiryFactor(daysLeft),
    missingDocuments: lc.documents.length > 0 ? Math.min(1, documentGaps / lc.documents.length) : 0,
    discrepancy: Math.min(1, openDiscrepancies / 2),
    outstandingAmount: amountFactor(lc.outstandingAmount || lc.amount),
    pendingApproval: lc.status === 'PENDING_APPROVAL' ? 1 : 0,
  };
  const score = weightedScore(factors);

  const reasons: string[] = [];
  if (factors.expiryProximity > 0) reasons.push(daysLeft <= 0 ? 'LC đã hết hạn' : `Còn hạn ${daysLeft} ngày`);
  if (documentGaps > 0) reasons.push(`${documentGaps}/${lc.documents.length} chứng từ thiếu/chờ xử lý`);
  if (openDiscrepancies > 0) reasons.push(`${openDiscrepancies} sai biệt đang mở`);
  if (lc.status === 'PENDING_APPROVAL') reasons.push('Đang chờ phê duyệt');
  if (factors.outstandingAmount > 0) reasons.push(factors.outstandingAmount >= 1 ? 'Giá trị outstanding lớn' : 'Giá trị outstanding đáng kể');

  return { entityType: 'LetterOfCredit', entityId: lc.lcNumber, score, level: levelFromScore(score), factors, reasons };
}

export function scoreGuaranteeRisk(bg: BankGuarantee, anchorToday: string): RiskScoreResult {
  const daysLeft = daysUntil(bg.expiryDate, anchorToday);
  const documentGaps = bg.documents.filter((d) => d.status === 'MISSING' || d.status === 'DISCREPANT' || d.status === 'PENDING').length;
  const activeClaims = bg.claims.filter((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW').length;

  const factors: RiskFactors = {
    expiryProximity: expiryFactor(daysLeft),
    missingDocuments: bg.documents.length > 0 ? Math.min(1, documentGaps / bg.documents.length) : 0,
    // Guarantees have no "discrepancy" record — an active claim is the equivalent urgent
    // driver (money may actually be called), mapped onto the same weight category.
    discrepancy: Math.min(1, activeClaims),
    outstandingAmount: amountFactor(bg.outstandingAmount || bg.amount),
    pendingApproval: bg.status === 'PENDING_APPROVAL' ? 1 : 0,
  };
  const score = weightedScore(factors);

  const reasons: string[] = [];
  if (factors.expiryProximity > 0) reasons.push(daysLeft <= 0 ? 'Bảo lãnh đã hết hạn' : `Còn hạn ${daysLeft} ngày`);
  if (activeClaims > 0) reasons.push(`${activeClaims} yêu cầu gọi bảo lãnh đang xử lý`);
  if (bg.extensionRequested) reasons.push('Đã yêu cầu gia hạn');
  if (bg.status === 'PENDING_APPROVAL') reasons.push('Đang chờ phê duyệt');
  if (factors.outstandingAmount > 0) reasons.push(factors.outstandingAmount >= 1 ? 'Giá trị outstanding lớn' : 'Giá trị outstanding đáng kể');
  if (documentGaps > 0) reasons.push(`${documentGaps}/${bg.documents.length} chứng từ thiếu/chờ xử lý`);

  return { entityType: 'BankGuarantee', entityId: bg.bgNumber, score, level: levelFromScore(score), factors, reasons };
}

export function scoreCollectionRisk(col: Collection, anchorToday: string): RiskScoreResult {
  const daysLeft = daysUntil(col.dueDate, anchorToday);
  const documentGaps = col.documents.filter((d) => d.status === 'MISSING' || d.status === 'DISCREPANT' || d.status === 'PENDING').length;

  const factors: RiskFactors = {
    expiryProximity: col.status === 'OVERDUE' ? 1 : expiryFactor(daysLeft),
    missingDocuments: col.documents.length > 0 ? Math.min(1, documentGaps / col.documents.length) : 0,
    discrepancy: 0,
    outstandingAmount: amountFactor(col.amount),
    pendingApproval: 0,
  };
  const score = weightedScore(factors);

  const reasons: string[] = [];
  if (col.status === 'OVERDUE') reasons.push('Đã quá hạn thanh toán');
  else if (factors.expiryProximity > 0) reasons.push(`Đến hạn còn ${daysLeft} ngày`);
  if (documentGaps > 0) reasons.push(`${documentGaps}/${col.documents.length} chứng từ thiếu/chờ xử lý`);

  return { entityType: 'Collection', entityId: col.collectionNumber, score, level: levelFromScore(score), factors, reasons };
}
