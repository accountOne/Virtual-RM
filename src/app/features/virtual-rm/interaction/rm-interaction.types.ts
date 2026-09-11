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

export interface RMMessage {
  id: string;
  from: 'USER' | 'RM';
  type: RMMessageType;
  content?: string;
  title?: string;
  metrics?: RMMetricItem[];
  entity?: RMEntitySummary;
  severity?: RMSeverity;
  actions?: RMAction[];
  quickReplies?: string[];
  timestamp: number;
}
