export type Intent =
  | 'GREETING'
  | 'HELP'
  | 'THANKS'
  | 'BATCH_TRANSFER'
  | 'TRANSFER'
  | 'PENDING_APPROVAL'
  | 'LARGEST_TRANSACTION'
  | 'BALANCE'
  | 'LOAN'
  | 'FX_RATE'
  | 'CONTRACT'
  | 'COMPANY_INFO'
  | 'ALERT'
  | 'REPORTS'
  | 'TASK'
  | 'PRODUCT'
  | 'INCOMING_PAYMENT'
  | 'TRANSACTION_SUMMARY'
  | 'OUTGOING_PAYMENT'
  | 'ACCOUNT'
  | 'DASHBOARD'
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
 * order; the first rule whose keyword appears in the normalized question wins,
 * so more specific phrases (e.g. batch transfer) are listed before broader ones
 * they're a superset of (e.g. single transfer). Keyword lists are deliberately
 * large and cover both *informational* phrasing ("có giao dịch nào chờ duyệt
 * không") and *action* phrasing ("tôi muốn phê duyệt", "phê duyệt") for the
 * same journey, since both should land on the same screen. Covers every
 * demoed feature and journey in the app: briefing/accounts, transfers (single
 * & batch), approvals, tasks, product recommendations, loans, FX, contracts,
 * company profile, alerts, and reports.
 */
const rules: IntentRule[] = [
  {
    intent: 'GREETING',
    keywords: ['xin chao', 'chao ban', 'chao virtual rm', 'chao rm', 'hello', 'hi virtual rm', 'alo', 'chao buoi sang', 'chao buoi chieu'],
  },
  { intent: 'THANKS', keywords: ['cam on', 'thanks', 'thank you', 'cam on nhieu'] },
  {
    intent: 'HELP',
    keywords: ['ban giup duoc gi', 'ho tro duoc gi', 'lam duoc gi', 'giup gi cho toi', 'huong dan', 'ban lam duoc nhung gi', 'chuc nang gi', 'tinh nang gi'],
  },

  // --- Batch transfer (checked before single transfer — "chuyển tiền hàng loạt"
  //     contains "chuyển tiền", so the more specific phrase must win first) ---
  {
    intent: 'BATCH_TRANSFER',
    keywords: [
      'chuyen tien hang loat', 'chi luong hang loat', 'thanh toan hang loat', 'chuyen luong nhan vien',
      'tai file danh sach chuyen tien', 'upload danh sach chuyen tien', 'chi luong nhan vien', 'chuyen tien theo danh sach',
    ],
  },

  // --- Single transfer / payment (action-oriented) ---
  {
    intent: 'TRANSFER',
    keywords: [
      'chuyen tien', 'toi muon chuyen tien', 'chuyen khoan', 'lam lenh chuyen tien', 'tao lenh chuyen tien',
      'gui tien cho', 'thanh toan nha cung cap', 'lap lenh chuyen tien', 'chuyen tien cho khach hang',
      'thuc hien chuyen tien', 'toi can chuyen tien', 'chuyen tien ngay', 'thanh toan cho doi tac', 'gui tien',
    ],
  },

  // --- Approvals (action-oriented + informational, both land on the same screen) ---
  {
    intent: 'PENDING_APPROVAL',
    keywords: [
      'cho phe duyet', 'cho duyet', 'dang cho duyet', 'can duyet', 'phe duyet', 'duyet giao dich', 'duyet lenh',
      'toi muon duyet', 'toi muon phe duyet', 'xu ly phe duyet', 'can phe duyet ngay', 'duyet ngay', 'duyet',
      'giao dich cho xu ly', 'xac nhan giao dich',
    ],
  },

  { intent: 'LARGEST_TRANSACTION', keywords: ['lon nhat', 'giao dich cao nhat', 'giao dich to nhat', 'giao dich gia tri lon nhat'] },

  {
    intent: 'BALANCE',
    keywords: ['so du', 'con bao nhieu tien', 'kiem tra so du', 'xem so du', 'tai khoan con bao nhieu', 'so du kha dung'],
  },

  {
    intent: 'LOAN',
    keywords: [
      'khoan vay', 'vay von', 'khoan no', 'lai suat vay', 'no vay', 'tra no', 'vay tien', 'dang ky vay',
      'thong tin khoan vay', 'han muc tin dung', 'vay von luu dong', 'khoan vay sap den han',
    ],
  },

  {
    intent: 'FX_RATE',
    keywords: [
      'ty gia', 'gia usd', 'gia ngoai te', 'ty gia hom nay', 'mua ngoai te', 'ban ngoai te', 'quy doi ngoai te',
      'ty gia usd', 'ty gia eur', 'gia mua ban ngoai te',
    ],
  },

  {
    intent: 'CONTRACT',
    keywords: ['hop dong', 'ky hop dong', 'toi muon ky hop dong', 'ky hop dong ngay', 'xem hop dong', 'gia han hop dong'],
  },

  {
    intent: 'COMPANY_INFO',
    keywords: [
      'ten cong ty', 'thong tin cong ty', 'thong tin doanh nghiep', 'ho so doanh nghiep', 'nganh nghe', 'quy mo doanh nghiep',
      'quy mo cong ty', 'ma khach hang', 'ma so cif', 'cif', 'cap nhat ho so', 'sua thong tin cong ty', 'ho so cong ty',
    ],
  },

  {
    intent: 'ALERT',
    keywords: [
      'canh bao', 'thong bao gi', 'co thong bao nao', 'luu y gi', 'co gi can luu y', 'tin nhan canh bao',
      'thong bao quan trong', 'co canh bao nao khong',
    ],
  },

  { intent: 'REPORTS', keywords: ['bao cao', 'xem bao cao', 'phan tich chi phi', 'bao cao dong tien', 'bao cao chi tiet', 'thong ke chi tieu'] },

  {
    intent: 'TASK',
    keywords: [
      'viec can', 'con viec', 'can xu ly', 'viec toi can', 'viec can lam', 'danh sach cong viec', 'nhiem vu', 'to do',
      'cong viec can hoan thanh', 'danh sach viec',
    ],
  },

  {
    intent: 'PRODUCT',
    keywords: [
      'san pham', 'giai phap', 'phu hop voi doanh nghiep', 'phu hop', 'danh sach san pham', 'cac san pham ngan hang',
      'dich vu tai chinh', 'goi y san pham', 'dich vu ngan hang',
    ],
  },

  {
    intent: 'INCOMING_PAYMENT',
    keywords: ['nhan bao nhieu', 'tien vao', 'da nhan duoc', 'nhan duoc bao nhieu', 'nhan tien', 'tien thu ve', 'doanh thu nhan duoc'],
  },

  { intent: 'TRANSACTION_SUMMARY', keywords: ['hom qua', 'giao dich hom qua', 'lich su giao dich'] },

  {
    intent: 'OUTGOING_PAYMENT',
    keywords: ['chi bao nhieu', 'chi tieu', 'chi ra bao nhieu', 'chi tieu thang nay', 'tong chi phi', 'tong so tien da chi'],
  },

  { intent: 'ACCOUNT', keywords: ['tai khoan', 'xem tai khoan', 'danh sach tai khoan', 'tai khoan cua toi'] },

  { intent: 'DASHBOARD', keywords: ['ve trang chu', 've dashboard', 'trang chinh', 'man hinh chinh'] },
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
