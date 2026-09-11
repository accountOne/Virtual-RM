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
