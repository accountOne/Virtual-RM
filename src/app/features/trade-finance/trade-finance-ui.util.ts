import { BadgeTone } from '../../shared/components/badge/badge.component';
import { TradeFinanceStatus } from '../../core/models';

/** Shared status → (Vietnamese label, badge tone) map for every Trade Finance list/detail
 * screen, so LC/Guarantee/Collection status badges look and read consistently. */
const STATUS_META: Record<TradeFinanceStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Đang hiệu lực', tone: 'positive' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
  COMPLETED: { label: 'Hoàn tất', tone: 'positive' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  PROCESSING: { label: 'Đang xử lý', tone: 'info' },
  OVERDUE: { label: 'Quá hạn', tone: 'critical' },
  PENDING_APPROVAL: { label: 'Chờ phê duyệt', tone: 'warning' },
  DOCUMENT_PENDING: { label: 'Chờ chứng từ', tone: 'warning' },
  DISCREPANCY: { label: 'Có sai biệt', tone: 'critical' },
  CLAIMED: { label: 'Đang bị gọi bảo lãnh', tone: 'critical' },
  AWAITING_PAYMENT: { label: 'Chờ thanh toán', tone: 'warning' },
  AWAITING_ACCEPTANCE: { label: 'Chờ chấp nhận', tone: 'warning' },
  ACCEPTED: { label: 'Đã chấp nhận', tone: 'positive' },
};

export function statusLabel(status: TradeFinanceStatus): string {
  return STATUS_META[status]?.label ?? status;
}

export function statusTone(status: TradeFinanceStatus): BadgeTone {
  return STATUS_META[status]?.tone ?? 'neutral';
}

export function daysUntil(dateOnly: string, anchorToday: string): number {
  const target = new Date(dateOnly.slice(0, 10) + 'T00:00:00Z').getTime();
  const today = new Date(anchorToday.slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

export const LC_SUBTYPE_LABEL: Record<string, string> = {
  SIGHT: 'Trả ngay (Sight)',
  USANCE: 'Trả chậm (Usance)',
  DEFERRED_PAYMENT: 'Thanh toán trả chậm',
  TRANSFERABLE: 'Có thể chuyển nhượng',
  STANDBY: 'Standby',
};

export const GUARANTEE_TYPE_LABEL: Record<string, string> = {
  BID_BOND: 'Bảo lãnh dự thầu',
  PERFORMANCE_BOND: 'Bảo lãnh thực hiện hợp đồng',
  ADVANCE_PAYMENT: 'Bảo lãnh tạm ứng',
  PAYMENT_GUARANTEE: 'Bảo lãnh thanh toán',
  WARRANTY: 'Bảo lãnh bảo hành',
  CUSTOMS: 'Bảo lãnh hải quan',
  TAX: 'Bảo lãnh thuế',
  OTHER: 'Bảo lãnh khác',
};

export const DOCUMENT_STATUS_LABEL: Record<string, { label: string; icon: string; tone: BadgeTone }> = {
  ACCEPTED: { label: 'Đã nhận', icon: '✓', tone: 'positive' },
  RECEIVED: { label: 'Đã nhận', icon: '✓', tone: 'positive' },
  PENDING: { label: 'Đang chờ', icon: '⏳', tone: 'warning' },
  DISCREPANT: { label: 'Sai biệt', icon: '⚠', tone: 'critical' },
  MISSING: { label: 'Thiếu', icon: '✗', tone: 'critical' },
};
