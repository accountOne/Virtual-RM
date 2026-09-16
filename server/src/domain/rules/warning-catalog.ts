// Canonical warning catalog (spec §5.3/§10/§11) — Maker and Checker MUST render the exact same
// title/message/severity for a given code, so both read from this one table rather than each
// building their own wording. A stored Warning (models/index.ts) always copies these fields at
// the moment it's raised (not a live re-lookup) so history stays accurate even if wording here
// changes later — but the `code` staying stable means old and new records still group/filter
// consistently.

import { Warning, WarningSeverity, WarningSource } from '../../models';

export interface WarningCatalogEntry {
  code: string;
  severity: WarningSeverity;
  title: string;
  message: (ctx?: Record<string, unknown>) => string;
  source: WarningSource;
  blocking: boolean;
}

function entry(
  code: string,
  severity: WarningSeverity,
  title: string,
  message: string | ((ctx?: Record<string, unknown>) => string),
  source: WarningSource = 'BUSINESS_RULE',
): WarningCatalogEntry {
  return { code, severity, title, message: typeof message === 'function' ? message : () => message, source, blocking: severity === 'BLOCKING' };
}

export const WARNING_CATALOG: Record<string, WarningCatalogEntry> = {
  TRANSFER_AMOUNT_REQUIRED: entry('TRANSFER_AMOUNT_REQUIRED', 'BLOCKING', 'Thiếu số tiền', 'Vui lòng nhập số tiền chuyển lớn hơn 0.'),
  SOURCE_ACCOUNT_REQUIRED: entry('SOURCE_ACCOUNT_REQUIRED', 'BLOCKING', 'Thiếu tài khoản nguồn', 'Vui lòng chọn tài khoản nguồn.'),
  BENEFICIARY_NAME_REQUIRED: entry('BENEFICIARY_NAME_REQUIRED', 'BLOCKING', 'Thiếu tên người thụ hưởng', 'Vui lòng nhập tên người/đơn vị thụ hưởng.'),
  BENEFICIARY_ACCOUNT_REQUIRED: entry('BENEFICIARY_ACCOUNT_REQUIRED', 'BLOCKING', 'Thiếu số tài khoản người nhận', 'Vui lòng nhập số tài khoản người thụ hưởng.'),
  BENEFICIARY_BANK_REQUIRED: entry('BENEFICIARY_BANK_REQUIRED', 'BLOCKING', 'Thiếu ngân hàng người nhận', 'Vui lòng chọn ngân hàng thụ hưởng từ danh sách.'),
  TRANSFER_PURPOSE_REQUIRED: entry('TRANSFER_PURPOSE_REQUIRED', 'BLOCKING', 'Thiếu mục đích chuyển tiền', 'Vui lòng nhập mục đích chuyển tiền.'),
  INSUFFICIENT_MOCK_BALANCE: entry(
    'INSUFFICIENT_MOCK_BALANCE',
    'BLOCKING',
    'Số dư khả dụng không đủ',
    (ctx) => `Số dư khả dụng của tài khoản nguồn (${formatMoney(ctx?.available)} ${ctx?.currency ?? ''}) không đủ để thực hiện giao dịch này.`,
  ),
  TRANSFER_LIMIT_WARNING: entry(
    'TRANSFER_LIMIT_WARNING',
    'WARNING',
    'Vượt hạn mức giao dịch tham khảo',
    (ctx) => `Số tiền vượt hạn mức chuyển tiền một lần tham khảo (${formatMoney(ctx?.limit)} ${ctx?.currency ?? ''}) — vẫn có thể gửi, Checker sẽ xem xét kỹ hơn.`,
  ),
  DUPLICATE_TRANSACTION_WARNING: entry(
    'DUPLICATE_TRANSACTION_WARNING',
    'WARNING',
    'Có thể trùng lệnh',
    'Phát hiện một lệnh chuyển tiền khác cùng người thụ hưởng và số tiền vừa được tạo gần đây — vui lòng kiểm tra tránh gửi trùng.',
  ),
  SAME_MAKER_CHECKER: entry('SAME_MAKER_CHECKER', 'BLOCKING', 'Không thể tự duyệt lệnh của chính mình', 'Người khởi tạo và người phê duyệt không được là cùng một người.', 'BACKEND'),
};

/** Builds a stored Warning from a catalog entry — the ONE place a rule file turns a code into
 * the object that gets persisted, so title/message wording can never drift between call sites. */
export function raiseWarning(code: keyof typeof WARNING_CATALOG, opts: { field?: string; ctx?: Record<string, unknown> } = {}): Warning {
  const catalogEntry = WARNING_CATALOG[code];
  return {
    code: catalogEntry.code,
    severity: catalogEntry.severity,
    title: catalogEntry.title,
    message: catalogEntry.message(opts.ctx),
    field: opts.field,
    source: catalogEntry.source,
    blocking: catalogEntry.blocking,
  };
}

function formatMoney(n: unknown): string {
  const value = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(value) ? value.toLocaleString('vi-VN') : '';
}
