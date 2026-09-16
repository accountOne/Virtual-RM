import { AgentResponse } from '../../../core/services/agent.service';
import { DailyDashboard, DashboardPriority, PriorityTask } from '../../../core/models/daily-dashboard.model';
import { SemanticAnswer, SemanticAnswerAction, buildLink } from '../../../core/services/rm-data.service';
import { RMAction, RMMessage, RMMetricItem, RMRecordListItem, RMSeverity } from './rm-interaction.types';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function toAction(a: SemanticAnswerAction): RMAction {
  return {
    label: a.label,
    type: 'NAVIGATE',
    route: buildLink(a.target, a.entityId),
    entityId: a.entityId,
  };
}

// --- RECORD_LIST heuristics -------------------------------------------------------------
// `SemanticAnswer.records` is `unknown[]` — its shape is whatever the matched intent's handler
// returned (server/src/semantic/response-generator.ts), not a single typed contract across all
// 94+ intents. These helpers recognize the common LC/Guarantee/Collection record shape (id
// field + type/subType + amount/currency + expiryDate/dueDate) well enough to render the
// full-screen redesign's grouped list card; an answer whose records don't match any of these
// (a single numeric answer, a briefing, etc.) falls back to the older per-field bubble layout
// below unchanged — see docs/phase-5.6-message-model.md's RECORD_LIST addendum for the honest
// scope of this (it is not a general-purpose typed reader of the whole semantic layer).
const ID_FIELD: { field: string; unit: string; entityType: string; navTarget: string }[] = [
  { field: 'lcNumber', unit: 'LC', entityType: 'LetterOfCredit', navTarget: 'OPEN_LC_DETAIL' },
  { field: 'guaranteeNumber', unit: 'Bảo lãnh', entityType: 'BankGuarantee', navTarget: 'OPEN_GUARANTEE_DETAIL' },
  { field: 'collectionNumber', unit: 'Nhờ thu', entityType: 'Collection', navTarget: 'OPEN_COLLECTION_DETAIL' },
];

const TYPE_LABEL: Record<string, string> = { IMPORT: 'Import LC', EXPORT: 'Export LC' };
const SUBTYPE_LABEL: Record<string, string> = {
  SIGHT: 'Trả ngay',
  USANCE: 'Trả chậm',
  DEFERRED: 'Trả chậm',
  CONFIRMED: 'Xác nhận',
};

function pickId(record: Record<string, unknown>): { value: string; unit: string; navTarget: string; entityType: string } | undefined {
  for (const cfg of ID_FIELD) {
    const v = record[cfg.field];
    if (typeof v === 'string' && v) return { value: v, unit: cfg.unit, navTarget: cfg.navTarget, entityType: cfg.entityType };
  }
  return undefined;
}

function formatAmount(amount: unknown, currency: unknown): string | undefined {
  if (typeof amount !== 'number') return undefined;
  if (currency === 'VND' || currency === undefined) return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
  return `${currency} ${new Intl.NumberFormat('en-US').format(amount)}`;
}

function formatDateBadge(prefix: string, iso: unknown): string | undefined {
  if (typeof iso !== 'string' || !iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${prefix}: ${dd}/${mm}/${d.getFullYear()}`;
}

function toRecordListItem(raw: unknown): RMRecordListItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const id = pickId(record);
  if (!id) return undefined;

  const subtitleParts: string[] = [];
  if (typeof record['type'] === 'string') subtitleParts.push(TYPE_LABEL[record['type']] ?? record['type']);
  if (typeof record['subType'] === 'string') subtitleParts.push(SUBTYPE_LABEL[record['subType']] ?? record['subType']);

  return {
    icon: '📄',
    title: id.value,
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : undefined,
    amount: formatAmount(record['amount'], record['currency']),
    badge: formatDateBadge('Hết hạn', record['expiryDate']) ?? formatDateBadge('Đến hạn', record['dueDate']),
    action: {
      label: `Xem ${id.value}`,
      type: 'NAVIGATE',
      route: buildLink(id.navTarget, id.value),
      entityType: id.entityType,
      entityId: id.value,
    },
  };
}

/** Attempts the grouped RECORD_LIST rendering; returns `undefined` when `answer.records` isn't
 * shaped like a list of LC/Guarantee/Collection records (see the heuristics above), so the
 * caller can fall back to the older per-field bubble layout. */
function buildRecordListMessage(answer: SemanticAnswer, now: number): RMMessage | undefined {
  if (!answer.records.length) return undefined;
  const items = answer.records.map(toRecordListItem);
  if (!items.every((item): item is RMRecordListItem => !!item)) return undefined;

  const unit = pickId(answer.records[0] as Record<string, unknown>)?.unit ?? 'mục';
  const actionSource = answer.actions?.length ? answer.actions : answer.action ? [answer.action] : [];

  return {
    id: nextId('list'),
    from: 'RM',
    type: 'RECORD_LIST',
    title: answer.title,
    content: answer.summary,
    badgeCount: `${items.length} ${unit}`,
    records: items.slice(0, 5),
    insight: answer.insights?.[0],
    actions: actionSource.length ? actionSource.map(toAction) : undefined,
    timestamp: now,
  };
}

/** Phase 5.6 (spec §7) — pure transform of the existing backend `SemanticAnswer` shape into a
 * sequence of rich `RMMessage` bubbles, one concern per bubble, instead of `rm-data.service.ts`'s
 * `toRmAnswer()` joining everything into one text blob. No backend change: same input shape,
 * richer frontend rendering — this is what makes the API "backward compatible" (spec DoD). */
export function buildRmMessages(answer: SemanticAnswer): RMMessage[] {
  const now = Date.now();

  const recordList = buildRecordListMessage(answer, now);
  if (recordList) {
    const messages = [recordList];
    if (answer.suggestedQuestions?.length) {
      messages.push({
        id: nextId('quick'),
        from: 'RM',
        type: 'QUICK_REPLY',
        quickReplies: answer.suggestedQuestions.slice(0, 3),
        timestamp: now,
      });
    }
    return messages;
  }

  const messages: RMMessage[] = [];

  if (answer.summary) {
    messages.push({
      id: nextId('text'),
      from: 'RM',
      type: 'TEXT',
      content: answer.summary,
      timestamp: now,
    });
  }

  const metrics: RMMetricItem[] = answer.metrics.slice(0, 5).map((m) => ({ label: m.label, value: m.value }));
  if (metrics.length) {
    messages.push({
      id: nextId('metric'),
      from: 'RM',
      type: 'METRIC',
      title: answer.title,
      metrics,
      timestamp: now,
    });
  }

  for (const insight of answer.insights ?? []) {
    messages.push({
      id: nextId('insight'),
      from: 'RM',
      type: 'INSIGHT',
      content: insight,
      timestamp: now,
    });
  }

  if (answer.recommendation) {
    messages.push({
      id: nextId('reco'),
      from: 'RM',
      type: 'RECOMMENDATION',
      title: answer.recommendation.title,
      content: answer.recommendation.description,
      timestamp: now,
    });
  }

  const actionSource = answer.actions?.length ? answer.actions : answer.action ? [answer.action] : [];
  if (actionSource.length) {
    messages.push({
      id: nextId('action'),
      from: 'RM',
      type: 'ACTION',
      actions: actionSource.map(toAction),
      timestamp: now,
    });
  }

  if (answer.suggestedQuestions?.length) {
    messages.push({
      id: nextId('quick'),
      from: 'RM',
      type: 'QUICK_REPLY',
      quickReplies: answer.suggestedQuestions.slice(0, 3),
      timestamp: now,
    });
  }

  // An answer with none of the above (shouldn't normally happen) still gets one bubble so the
  // customer always sees something rather than a silent empty response.
  if (!messages.length) {
    messages.push({
      id: nextId('text'),
      from: 'RM',
      type: 'TEXT',
      content: answer.title || 'Em chưa tìm thấy thông tin phù hợp.',
      timestamp: now,
    });
  }

  return messages;
}

const PRIORITY_TO_SEVERITY: Record<DashboardPriority, RMSeverity> = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'CRITICAL',
};

const PRIORITY_ICON: Record<DashboardPriority, string> = {
  LOW: '🛡️',
  MEDIUM: '💳',
  HIGH: '🕐',
  URGENT: '🕐',
};

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

function toUrgentItemAction(item: PriorityTask): RMAction | undefined {
  if (!item.navigation) return undefined;
  return {
    label: item.navigation.label,
    type: 'NAVIGATE',
    route: item.navigation.route,
    entityType: item.navigation.entityType,
    entityId: item.navigation.entityId,
  };
}

/** Category-shortcut chips shown right after the greeting (spec's proactive-RM UX) — matches
 * the same destinations `QUICK_NAV` in the (now-removed) chat widget used to offer statically,
 * now offered as part of the greeting itself instead of a separate always-visible row. */
function buildCategoryShortcuts(now: number): RMMessage {
  return {
    id: nextId('shortcuts'),
    from: 'RM',
    type: 'ACTION',
    content: 'Anh/chị muốn em kiểm tra phần nào trước?',
    actions: [
      { label: 'LC', icon: '📄', type: 'NAVIGATE', route: '/trade-finance/lc' },
      { label: 'Bảo lãnh', icon: '🛡️', type: 'NAVIGATE', route: '/trade-finance/guarantees' },
      { label: 'Thanh toán', icon: '💳', type: 'NAVIGATE', route: '/payments' },
      { label: 'Dòng tiền', icon: '📈', type: 'NAVIGATE', route: '/virtual-rm' },
      // BRD "Virtual RM gợi ý các câu hỏi liên quan đến Daily Dashboard hoặc dấu ấn cá nhân".
      { label: 'Dấu ấn', icon: '🎖️', type: 'NAVIGATE', route: '/footprint' },
    ],
    timestamp: now,
  };
}

/** Phase 5.6 Proactive RM (spec §9/§20/§35 Flow 6) — turns the already-shipped Phase 5.5
 * `DailyDashboard` (greeting + cashflow + urgentItems from the Priority Engine) into a lively,
 * multi-bubble chat opener instead of one static sentence, reusing that real ranked data rather
 * than inventing a second greeting/priority system. Urgent items render as one grouped
 * RECORD_LIST card (full-screen redesign) instead of one ALERT bubble per item. */
export function buildProactiveGreeting(dashboard: DailyDashboard): RMMessage[] {
  const now = Date.now();
  const messages: RMMessage[] = [];

  messages.push({ id: nextId('greet'), from: 'RM', type: 'TEXT', content: dashboard.greeting.message, timestamp: now });

  if (dashboard.cashflow) {
    const cf = dashboard.cashflow;
    messages.push({
      id: nextId('cashflow'),
      from: 'RM',
      type: 'METRIC',
      title: 'Dòng tiền hôm nay',
      metrics: [
        { label: 'Số dư hiện tại', value: formatVnd(cf.currentBalance) },
        { label: 'Thu vào', value: formatVnd(cf.totalIncoming) },
        { label: 'Chi ra', value: formatVnd(cf.totalOutgoing) },
      ],
      timestamp: now,
    });
    if (cf.insight) {
      messages.push({ id: nextId('cashflow-insight'), from: 'RM', type: 'INSIGHT', content: cf.insight, timestamp: now });
    }
  }

  const urgent = dashboard.urgentItems.slice(0, 5);
  if (urgent.length) {
    messages.push({
      id: nextId('urgent'),
      from: 'RM',
      type: 'RECORD_LIST',
      title: '⚠️ Việc cần lưu ý',
      records: urgent.map((item) => ({
        icon: PRIORITY_ICON[item.priority],
        title: item.title,
        badgeTone: PRIORITY_TO_SEVERITY[item.priority],
        action: toUrgentItemAction(item),
      })),
      timestamp: now,
    });
  } else {
    messages.push({
      id: nextId('urgent-none'),
      from: 'RM',
      type: 'TEXT',
      content: 'Mọi việc hôm nay đều ổn, không có gì cần anh/chị xử lý gấp ạ.',
      timestamp: now,
    });
  }

  messages.push(buildCategoryShortcuts(now));

  return messages;
}

// --- Gemini AI Agent (docs/AI_AGENT_ARCHITECTURE.md) -----------------------------------------

const PREVIEW_FIELD_LABELS: Record<string, string> = {
  amount: 'Số tiền',
  currency: 'Loại tiền',
  beneficiaryName: 'Người thụ hưởng',
  beneficiary: 'Người thụ hưởng',
  sourceAccountLabel: 'Tài khoản nguồn',
  fee: 'Phí',
  lcType: 'Loại',
  subType: 'Hình thức',
  type: 'Hình thức',
  expiryDate: 'Ngày hết hạn',
  dueDate: 'Ngày đến hạn',
  guaranteeType: 'Loại bảo lãnh',
  collectionType: 'Loại nhờ thu',
  drawee: 'Đối tác',
};

function formatPreviewValue(key: string, value: unknown): string {
  if ((key === 'amount' || key === 'fee') && typeof value === 'number') {
    return new Intl.NumberFormat('vi-VN').format(value) + ' đ';
  }
  return String(value);
}

function buildPreviewMetrics(preview: Record<string, unknown>): RMMetricItem[] {
  return Object.entries(preview)
    .filter(([key]) => key in PREVIEW_FIELD_LABELS)
    .map(([key, value]) => ({ label: PREVIEW_FIELD_LABELS[key], value: formatPreviewValue(key, value) }));
}

/** Turns one backend AgentResponse (POST /api/agent/message) into RMMessage bubbles. A
 * WAITING_APPROVAL response becomes a preview card (METRIC) plus an explicit approve/cancel
 * action row — the spec's own "Xác nhận giao dịch" mock — reusing RMAction.type 'CONFIRM'
 * exactly like the existing LC PO-upload assistant's Import/Export step already does, just with
 * a distinguishable payload shape ({agentAction: 'approve'|'cancel', ...} vs. LC-assist's
 * {step, value}) so rm-chat-session.service.ts's handleAction can tell them apart. Every other
 * status is a single text bubble — the backend's response-templates.ts already phrases a
 * natural, complete Vietnamese message for every case (spec §16). */
export function buildAgentMessages(response: AgentResponse): RMMessage[] {
  const now = Date.now();

  // Maker/Checker upgrade, Slices 5+6 (spec §7 "form-driven agent") — every write intent hands
  // off to a real BankingCommand draft instead of the Agent's own WAITING_APPROVAL card. Reuses
  // the same NAVIGATE+payload mechanism the LC PO-upload assistant already established for
  // passing structured prefill data via router state (see lc-create.page.ts's own
  // `history.state` read) — each form reads `commandId` the same way single-transfer.page.ts
  // does and loads the real draft from the server.
  if (response.commandId) {
    const routeByIntent: Partial<Record<string, { route: string; label: string }>> = {
      create_transfer: { route: '/payments/single-transfer', label: 'Mở form chuyển tiền' },
      create_lc: { route: '/trade-finance/lc/create', label: 'Mở form mở LC' },
      create_guarantee: { route: '/trade-finance/guarantees/create', label: 'Mở form phát hành bảo lãnh' },
      create_collection: { route: '/trade-finance/collections/create', label: 'Mở form tạo nhờ thu' },
    };
    const target = routeByIntent[response.intent ?? ''] ?? routeByIntent['create_transfer']!;
    return [
      {
        id: nextId('agent-form-handoff'),
        from: 'RM',
        type: 'ACTION',
        content: response.message,
        actions: [{ label: target.label, type: 'NAVIGATE', route: target.route, payload: { commandId: response.commandId } }],
        timestamp: now,
      },
    ];
  }

  if (response.status === 'WAITING_APPROVAL' && response.preview && response.workflowId && response.idempotencyKey) {
    const metrics = buildPreviewMetrics(response.preview);
    const messages: RMMessage[] = [];
    if (metrics.length) {
      messages.push({ id: nextId('agent-preview'), from: 'RM', type: 'METRIC', title: 'Xác nhận giao dịch', metrics, timestamp: now });
    }
    messages.push({
      id: nextId('agent-approval'),
      from: 'RM',
      type: 'ACTION',
      content: response.message,
      actions: [
        { label: 'Hủy', type: 'CONFIRM', payload: { agentAction: 'cancel', workflowId: response.workflowId } },
        { label: 'Xác nhận', type: 'CONFIRM', payload: { agentAction: 'approve', workflowId: response.workflowId, idempotencyKey: response.idempotencyKey } },
      ],
      timestamp: now,
    });
    return messages;
  }

  return [{ id: nextId('agent-text'), from: 'RM', type: 'TEXT', content: response.message, timestamp: now }];
}
