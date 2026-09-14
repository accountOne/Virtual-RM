// Phase 5.5 BRD alignment — "LC PO-upload Virtual RM assistant" (docs/phase-5.5-lc-assistant.md).
// DEMO ONLY, confirmed with the user before building this: it does NOT read the uploaded file's
// actual content — no OCR/AI document parsing is wired in anywhere. It deterministically picks
// one of a few canned PO templates from the file's name/size, the same "deterministic mock, not
// real ML" convention `MockReasoningProvider` already uses elsewhere in this codebase. The same
// file (same name + size) always yields the same result.

export interface PoExtractedFields {
  type: 'IMPORT' | 'EXPORT';
  subType: 'SIGHT' | 'USANCE';
  beneficiary: string;
  /** Filled in by the controller from the real customer record, not by the template — a PO
   * never "extracts" the buyer's own company name, it's already known from the session. */
  applicant?: string;
  currency: string;
  amount: number;
  latestShipmentDate?: string;
  expiryDate?: string;
  requiredDocuments: string[];
}

export interface PoAnalysisResult {
  templateLabel: string;
  extracted: PoExtractedFields;
  missingFields: (keyof PoExtractedFields)[];
}

interface PoTemplate {
  label: string;
  beneficiary: string;
  subType: 'SIGHT' | 'USANCE';
  currency: string;
  amount: number;
  /** Undefined on purpose for some templates — BRD step 6 expects the customer to fill in a
   * couple of fields themselves rather than everything arriving pre-filled. */
  shipmentOffsetDays?: number;
  expiryOffsetDays?: number;
  requiredDocuments: string[];
}

const TEMPLATES: PoTemplate[] = [
  {
    label: 'Đơn hàng máy móc thiết bị — Hyundai Heavy Industries (Hàn Quốc)',
    beneficiary: 'Hyundai Heavy Industries Co., Ltd',
    subType: 'SIGHT',
    currency: 'USD',
    amount: 185000,
    shipmentOffsetDays: 30,
    requiredDocuments: ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING', 'CERTIFICATE_OF_ORIGIN'],
  },
  {
    label: 'Đơn hàng nguyên liệu nhựa — Formosa Plastics Corporation (Đài Loan)',
    beneficiary: 'Formosa Plastics Corporation',
    subType: 'USANCE',
    currency: 'USD',
    amount: 62000,
    expiryOffsetDays: 60,
    requiredDocuments: ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING'],
  },
  {
    label: 'Đơn hàng linh kiện điện tử — Bosch Vietnam Co., Ltd',
    beneficiary: 'Bosch Vietnam Co., Ltd',
    subType: 'SIGHT',
    currency: 'EUR',
    amount: 45000,
    shipmentOffsetDays: 21,
    expiryOffsetDays: 51,
    requiredDocuments: ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING', 'INSURANCE_CERTIFICATE'],
  },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Deterministic: the same `fileName`+`fileSizeBytes` always picks the same template — this is
 * what "analyze" means here, not real document understanding. `today` is injectable for tests. */
export function analyzePo(fileName: string, fileSizeBytes: number, today: Date = new Date()): PoAnalysisResult {
  const key = `${fileName.toLowerCase()}::${fileSizeBytes}`;
  const template = TEMPLATES[hashString(key) % TEMPLATES.length];

  const latestShipmentDate = template.shipmentOffsetDays !== undefined ? addDays(today, template.shipmentOffsetDays) : undefined;
  const expiryDate = template.expiryOffsetDays !== undefined ? addDays(today, template.expiryOffsetDays) : undefined;
  const missingFields: (keyof PoExtractedFields)[] = [];
  if (!latestShipmentDate) missingFields.push('latestShipmentDate');
  if (!expiryDate) missingFields.push('expiryDate');

  return {
    templateLabel: template.label,
    extracted: {
      type: 'IMPORT',
      subType: template.subType,
      beneficiary: template.beneficiary,
      currency: template.currency,
      amount: template.amount,
      latestShipmentDate,
      expiryDate,
      requiredDocuments: template.requiredDocuments,
    },
    missingFields,
  };
}

export interface LcDraftInput {
  type: string;
  subType: string;
  beneficiary: string;
  applicant: string;
  issuingBank: string;
  advisingBank?: string;
  currency: string;
  amount: number;
  latestShipmentDate: string;
  expiryDate: string;
  requiredDocuments: string[];
}

/** Plain template string, no AI call — same "config/template, not generative" convention as the
 * rest of this demo's mock content. Always carries the DRAFT/ILLUSTRATIVE label so nobody
 * mistakes it for a real SWIFT MT700 message. */
export function buildLcDraftMessage(input: LcDraftInput): string {
  const amountFormatted = new Intl.NumberFormat('en-US').format(input.amount);
  return [
    'BẢN NHÁP — CHỈ MANG TÍNH MINH HỌA, KHÔNG PHẢI ĐIỆN SWIFT CHÍNH THỨC',
    '',
    `Loại thư tín dụng: ${input.type} — ${input.subType}`,
    `Người mở (Applicant): ${input.applicant}`,
    `Người thụ hưởng (Beneficiary): ${input.beneficiary}`,
    `Ngân hàng phát hành: ${input.issuingBank}`,
    `Ngân hàng thông báo: ${input.advisingBank || '(chưa xác định)'}`,
    `Số tiền: ${input.currency} ${amountFormatted}`,
    `Ngày giao hàng chậm nhất: ${input.latestShipmentDate}`,
    `Ngày hết hạn hiệu lực: ${input.expiryDate}`,
    `Chứng từ yêu cầu: ${input.requiredDocuments.join(', ') || '(chưa chọn)'}`,
  ].join('\n');
}
