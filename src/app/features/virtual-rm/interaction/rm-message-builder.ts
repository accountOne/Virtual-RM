import { DailyDashboard, DashboardPriority, PriorityTask } from '../../../core/models/daily-dashboard.model';
import { SemanticAnswer, SemanticAnswerAction, buildLink } from '../../../core/services/rm-data.service';
import { RMAction, RMMessage, RMMetricItem, RMSeverity } from './rm-interaction.types';

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

/** Phase 5.6 (spec §7) — pure transform of the existing backend `SemanticAnswer` shape into a
 * sequence of rich `RMMessage` bubbles, one concern per bubble, instead of `rm-data.service.ts`'s
 * `toRmAnswer()` joining everything into one text blob. No backend change: same input shape,
 * richer frontend rendering — this is what makes the API "backward compatible" (spec DoD). */
export function buildRmMessages(answer: SemanticAnswer): RMMessage[] {
  const now = Date.now();
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

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

function toUrgentItemAction(item: PriorityTask): RMAction[] | undefined {
  if (!item.navigation) return undefined;
  return [
    {
      label: item.navigation.label,
      type: 'NAVIGATE',
      route: item.navigation.route,
      entityType: item.navigation.entityType,
      entityId: item.navigation.entityId,
    },
  ];
}

/** Phase 5.6 Proactive RM (spec §9/§20/§35 Flow 6) — turns the already-shipped Phase 5.5
 * `DailyDashboard` (greeting + cashflow + urgentItems from the Priority Engine) into a lively,
 * multi-bubble chat opener instead of one static sentence, reusing that real ranked data rather
 * than inventing a second greeting/priority system. */
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

  const urgent = dashboard.urgentItems.slice(0, 3);
  if (urgent.length) {
    messages.push({
      id: nextId('urgent-intro'),
      from: 'RM',
      type: 'TEXT',
      content: `Em đã rà soát và thấy có ${dashboard.urgentItems.length} việc cần anh/chị lưu ý hôm nay:`,
      timestamp: now,
    });
    for (const item of urgent) {
      messages.push({
        id: nextId('urgent'),
        from: 'RM',
        type: 'ALERT',
        title: item.title,
        content: item.reason,
        severity: PRIORITY_TO_SEVERITY[item.priority],
        actions: toUrgentItemAction(item),
        timestamp: now,
      });
    }
  } else {
    messages.push({
      id: nextId('urgent-none'),
      from: 'RM',
      type: 'TEXT',
      content: 'Mọi việc hôm nay đều ổn, không có gì cần anh/chị xử lý gấp ạ.',
      timestamp: now,
    });
  }

  return messages;
}
