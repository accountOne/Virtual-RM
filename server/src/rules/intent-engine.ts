export type Intent =
  | 'GREETING'
  | 'HELP'
  | 'THANKS'
  | 'PENDING_APPROVAL'
  | 'LARGEST_TRANSACTION'
  | 'BALANCE'
  | 'LOAN'
  | 'FX_RATE'
  | 'CONTRACT'
  | 'COMPANY_INFO'
  | 'ALERT'
  | 'TASK'
  | 'PRODUCT'
  | 'INCOMING_PAYMENT'
  | 'TRANSACTION_SUMMARY'
  | 'OUTGOING_PAYMENT'
  | 'ACCOUNT'
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
 * Covers vocabulary across every demoed capability: briefing/accounts, smart
 * alerts, task assistant, product recommendations, and the banking journeys
 * (loans, FX, contracts, company profile) those alerts/tasks deep-link to.
 */
const rules: IntentRule[] = [
  { intent: 'GREETING', keywords: ['xin chao', 'chao ban', 'chao virtual rm', 'hello', 'alo'] },
  { intent: 'THANKS', keywords: ['cam on'] },
  { intent: 'HELP', keywords: ['ban giup duoc gi', 'ho tro duoc gi', 'lam duoc gi', 'giup gi cho toi', 'huong dan'] },
  { intent: 'PENDING_APPROVAL', keywords: ['cho phe duyet', 'cho duyet', 'dang cho duyet', 'can duyet'] },
  { intent: 'LARGEST_TRANSACTION', keywords: ['lon nhat'] },
  { intent: 'BALANCE', keywords: ['so du'] },
  { intent: 'LOAN', keywords: ['khoan vay', 'vay von', 'khoan no', 'lai suat vay', 'no vay', 'tra no'] },
  { intent: 'FX_RATE', keywords: ['ty gia', 'gia usd', 'gia ngoai te', 'ty gia hom nay'] },
  { intent: 'CONTRACT', keywords: ['hop dong', 'ky hop dong'] },
  {
    intent: 'COMPANY_INFO',
    keywords: ['ten cong ty', 'thong tin cong ty', 'thong tin doanh nghiep', 'ho so doanh nghiep', 'nganh nghe', 'quy mo doanh nghiep', 'quy mo cong ty', 'ma khach hang', 'ma so cif', 'cif'],
  },
  { intent: 'ALERT', keywords: ['canh bao', 'thong bao gi', 'co thong bao nao', 'luu y gi'] },
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
