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

/** Strips Vietnamese diacritics and lowercases, so the engine matches whether or not the user types dấu. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

interface IntentRule {
  intent: Intent;
  keywords: string[];
}

/**
 * Deterministic keyword-based intent classifier — no LLM. Rules are checked in
 * order; the first rule whose keyword appears in the normalized question wins.
 */
const rules: IntentRule[] = [
  { intent: 'PENDING_APPROVAL', keywords: ['cho phe duyet', 'cho duyet', 'dang cho duyet', 'can duyet'] },
  { intent: 'LARGEST_TRANSACTION', keywords: ['lon nhat'] },
  { intent: 'BALANCE', keywords: ['so du'] },
  { intent: 'TASK', keywords: ['viec can', 'con viec', 'can xu ly', 'viec toi can'] },
  { intent: 'PRODUCT', keywords: ['san pham', 'giai phap', 'phu hop voi doanh nghiep', 'phu hop'] },
  { intent: 'INCOMING_PAYMENT', keywords: ['nhan bao nhieu', 'tien vao', 'da nhan duoc', 'nhan duoc bao nhieu', 'nhan tien'] },
  { intent: 'TRANSACTION_SUMMARY', keywords: ['hom qua'] },
  { intent: 'OUTGOING_PAYMENT', keywords: ['chi bao nhieu', 'chi tieu', 'chi ra bao nhieu'] },
  { intent: 'ACCOUNT', keywords: ['tai khoan'] },
];

export function detectIntent(question: string): { intent: Intent; period: 'YESTERDAY' | 'MONTH' } {
  const normalized = normalize(question);
  const period: 'YESTERDAY' | 'MONTH' = normalized.includes('thang nay') || normalized.includes('trong thang') ? 'MONTH' : 'YESTERDAY';

  for (const rule of rules) {
    if (rule.keywords.some((k) => normalized.includes(k))) {
      return { intent: rule.intent, period };
    }
  }
  return { intent: 'UNKNOWN', period };
}
