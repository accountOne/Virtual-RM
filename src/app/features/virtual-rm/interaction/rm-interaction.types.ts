// Phase 5.6 — Human-like Virtual RM Interaction UX. Frontend-only types: the backend contract
// (SemanticAnswer/SemanticQueryResult) is unchanged and backward compatible — see
// docs/phase-5.6-message-model.md. RMMessage is a pure transform of the existing answer shape,
// not a new backend response format.

/** High-level UX state, never internal reasoning (spec §4: "Không được hiển thị
 * chain-of-thought. Chỉ hiển thị trạng thái UX cấp cao"). */
export type RMState =
  | 'IDLE'
  | 'GREETING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'ANALYZING'
  | 'RESPONDING'
  | 'RECOMMENDING'
  | 'WAITING_FOR_USER'
  | 'NAVIGATING'
  | 'SUCCESS'
  | 'HANDOFF';

/** User-facing label for each state — short, no chain-of-thought, per spec §4's own examples. */
export const RM_STATE_LABEL: Partial<Record<RMState, string>> = {
  LISTENING: 'Em đang lắng nghe...',
  PROCESSING: 'Em đang kiểm tra thông tin...',
  ANALYZING: 'Em đang phân tích...',
  RESPONDING: 'Em đang chuẩn bị câu trả lời...',
};

export type RMMessageType =
  | 'TEXT'
  | 'TYPING'
  | 'METRIC'
  | 'INSIGHT'
  | 'ALERT'
  | 'ENTITY'
  // Full-screen redesign (UI feedback round) — a grouped card of clickable rows (LC/Guarantee/
  // Collection list, Priority Engine urgent items), one card per answer instead of one bubble
  // per record. See docs/phase-5.6-message-model.md's RECORD_LIST addendum.
  | 'RECORD_LIST'
  | 'CHECKLIST'
  | 'TIMELINE'
  | 'RECOMMENDATION'
  | 'ACTION'
  | 'QUICK_REPLY'
  | 'CONFIRMATION'
  | 'NAVIGATION'
  | 'HANDOFF';

export type RMSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RMAction {
  label: string;
  type: 'NAVIGATE' | 'QUERY' | 'CONFIRM' | 'UPLOAD' | 'DOWNLOAD' | 'HANDOFF';
  route?: string;
  entityType?: string;
  entityId?: string;
  payload?: unknown;
  /** Present only for the small set of "category shortcut" actions (e.g. the proactive
   * greeting's LC/Bảo lãnh/Thanh toán/Dòng tiền chips) — renders as an icon+label pill instead
   * of a plain button. */
  icon?: string;
}

export interface RMMetricItem {
  label: string;
  value: string;
}

export interface RMEntitySummary {
  entityType: string;
  entityId: string;
  title: string;
  fields: { label: string; value: string }[];
}

/** One clickable row inside a RECORD_LIST card. */
export interface RMRecordListItem {
  icon?: string;
  title: string;
  subtitle?: string;
  amount?: string;
  badge?: string;
  badgeTone?: RMSeverity;
  action?: RMAction;
}

export interface RMMessage {
  id: string;
  from: 'USER' | 'RM';
  type: RMMessageType;
  content?: string;
  title?: string;
  metrics?: RMMetricItem[];
  entity?: RMEntitySummary;
  /** RECORD_LIST only. */
  records?: RMRecordListItem[];
  /** RECORD_LIST only — a small count pill next to the card title, e.g. "2 LC". */
  badgeCount?: string;
  /** RECORD_LIST only — a short highlighted takeaway rendered inside the card, below the rows. */
  insight?: string;
  severity?: RMSeverity;
  actions?: RMAction[];
  quickReplies?: string[];
  timestamp: number;
}
