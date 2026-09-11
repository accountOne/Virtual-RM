import { DailyDashboard, PriorityTask } from '../../../../core/models/daily-dashboard.model';
import { SemanticAnswer } from '../../../../core/services/rm-data.service';
import { buildProactiveGreeting, buildRmMessages } from '../rm-message-builder';
import { assert, assertEqual, describe, test } from './test-runner';

function baseAnswer(overrides: Partial<SemanticAnswer> = {}): SemanticAnswer {
  return { title: '', summary: '', metrics: [], records: [], ...overrides };
}

describe('rm-message-builder — buildRmMessages', () => {
  test('summary alone produces exactly one TEXT bubble', () => {
    const messages = buildRmMessages(baseAnswer({ summary: 'Số dư hiện tại: 1.2 tỷ đ' }));
    assertEqual(messages.length, 1, 'expected exactly 1 message');
    assertEqual(messages[0].type, 'TEXT');
    assertEqual(messages[0].content, 'Số dư hiện tại: 1.2 tỷ đ');
    assertEqual(messages[0].from, 'RM');
  });

  test('metrics produce a METRIC bubble carrying the answer title, capped at 5', () => {
    const metrics = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, value: `V${i}` }));
    const messages = buildRmMessages(baseAnswer({ title: 'Tổng quan', metrics }));
    const metricMsg = messages.find((m) => m.type === 'METRIC');
    assert(!!metricMsg, 'expected a METRIC message');
    assertEqual(metricMsg!.title, 'Tổng quan');
    assertEqual(metricMsg!.metrics?.length, 5, 'metrics must be capped at 5');
    assertEqual(metricMsg!.metrics?.[0].label, 'L0');
  });

  test('each insight becomes its own INSIGHT bubble', () => {
    const messages = buildRmMessages(baseAnswer({ insights: ['Insight A', 'Insight B'] }));
    const insightMsgs = messages.filter((m) => m.type === 'INSIGHT');
    assertEqual(insightMsgs.length, 2);
    assertEqual(insightMsgs[0].content, 'Insight A');
    assertEqual(insightMsgs[1].content, 'Insight B');
  });

  test('recommendation becomes one RECOMMENDATION bubble with title + description', () => {
    const messages = buildRmMessages(baseAnswer({ recommendation: { title: 'Gợi ý', description: 'Nên làm X' } }));
    const reco = messages.find((m) => m.type === 'RECOMMENDATION');
    assert(!!reco, 'expected a RECOMMENDATION message');
    assertEqual(reco!.title, 'Gợi ý');
    assertEqual(reco!.content, 'Nên làm X');
  });

  test('actions[] (multiple) become one ACTION bubble with a NAVIGATE action per entry, routed via buildLink', () => {
    const messages = buildRmMessages(
      baseAnswer({
        actions: [
          { label: 'Xem LC 1', type: 'NAVIGATE', target: 'OPEN_LC_DETAIL', entityId: 'LC-2026-001' },
          { label: 'Xem LC 2', type: 'NAVIGATE', target: 'OPEN_LC_DETAIL', entityId: 'LC-2026-002' },
        ],
      }),
    );
    const actionMsg = messages.find((m) => m.type === 'ACTION');
    assert(!!actionMsg, 'expected an ACTION message');
    assertEqual(actionMsg!.actions?.length, 2);
    assertEqual(actionMsg!.actions?.[0].route, '/trade-finance/lc/LC-2026-001');
    assertEqual(actionMsg!.actions?.[0].type, 'NAVIGATE');
    assertEqual(actionMsg!.actions?.[1].route, '/trade-finance/lc/LC-2026-002');
  });

  test('a single `action` (no actions[]) still produces a one-item ACTION bubble', () => {
    const messages = buildRmMessages(
      baseAnswer({ action: { label: 'Về Dashboard', type: 'NAVIGATE', target: 'OPEN_DASHBOARD' } }),
    );
    const actionMsg = messages.find((m) => m.type === 'ACTION');
    assert(!!actionMsg, 'expected an ACTION message');
    assertEqual(actionMsg!.actions?.length, 1);
    assertEqual(actionMsg!.actions?.[0].route, '/dashboard');
  });

  test('suggestedQuestions produce a QUICK_REPLY bubble, capped at 3', () => {
    const messages = buildRmMessages(baseAnswer({ suggestedQuestions: ['Q1', 'Q2', 'Q3', 'Q4'] }));
    const quick = messages.find((m) => m.type === 'QUICK_REPLY');
    assert(!!quick, 'expected a QUICK_REPLY message');
    assertEqual(quick!.quickReplies?.length, 3);
  });

  test('a fully empty answer still produces exactly one fallback TEXT bubble (never a silent empty response)', () => {
    const messages = buildRmMessages(baseAnswer());
    assertEqual(messages.length, 1);
    assertEqual(messages[0].type, 'TEXT');
    assert(!!messages[0].content, 'fallback bubble must have some content');
  });

  test('a rich answer orders bubbles TEXT -> METRIC -> INSIGHT -> RECOMMENDATION -> ACTION -> QUICK_REPLY', () => {
    const messages = buildRmMessages(
      baseAnswer({
        summary: 'Tóm tắt',
        metrics: [{ label: 'L', value: 'V' }],
        insights: ['I'],
        recommendation: { title: 'T', description: 'D' },
        action: { label: 'Đi', type: 'NAVIGATE', target: 'OPEN_DASHBOARD' },
        suggestedQuestions: ['Q1'],
      }),
    );
    assertEqual(
      messages.map((m) => m.type).join(','),
      'TEXT,METRIC,INSIGHT,RECOMMENDATION,ACTION,QUICK_REPLY',
    );
  });
});

function urgentItem(overrides: Partial<PriorityTask>): PriorityTask {
  return { id: 'p1', title: 'Việc cần làm', priority: 'MEDIUM', reason: 'Vì lý do X', ...overrides };
}

function baseDashboard(overrides: Partial<DailyDashboard> = {}): DailyDashboard {
  return {
    greeting: { timeOfDay: 'MORNING', message: 'Chào buổi sáng!' },
    cashflow: { period: 'TODAY', currentBalance: 1_000_000, totalIncoming: 500_000, totalOutgoing: 200_000, net: 300_000, insight: '' },
    pendingApprovals: { count: 0, totalAmount: 0, items: [] },
    tasks: { openCount: 0, items: [] },
    urgentItems: [],
    insights: [],
    navigation: [],
    ...overrides,
  };
}

describe('rm-message-builder — buildProactiveGreeting', () => {
  test('greeting message is always the first bubble', () => {
    const messages = buildProactiveGreeting(baseDashboard());
    assertEqual(messages[0].type, 'TEXT');
    assertEqual(messages[0].content, 'Chào buổi sáng!');
  });

  test('cashflow becomes a METRIC bubble with formatted VND values', () => {
    const messages = buildProactiveGreeting(baseDashboard());
    const metric = messages.find((m) => m.type === 'METRIC');
    assert(!!metric, 'expected a cashflow METRIC message');
    assertEqual(metric!.metrics?.[0].value, '1.000.000 đ');
  });

  test('an empty cashflow.insight adds no INSIGHT bubble', () => {
    const messages = buildProactiveGreeting(baseDashboard());
    assertEqual(messages.filter((m) => m.type === 'INSIGHT').length, 0);
  });

  test('a non-empty cashflow.insight adds one INSIGHT bubble', () => {
    const messages = buildProactiveGreeting(
      baseDashboard({ cashflow: { period: 'TODAY', currentBalance: 1, totalIncoming: 1, totalOutgoing: 1, net: 1, insight: 'Dòng tiền ổn định' } }),
    );
    const insight = messages.find((m) => m.type === 'INSIGHT');
    assert(!!insight, 'expected a cashflow INSIGHT message');
    assertEqual(insight!.content, 'Dòng tiền ổn định');
  });

  test('no urgent items -> one reassuring TEXT bubble, no ALERT bubbles', () => {
    const messages = buildProactiveGreeting(baseDashboard({ urgentItems: [] }));
    assertEqual(messages.filter((m) => m.type === 'ALERT').length, 0);
    assert(
      messages.some((m) => m.type === 'TEXT' && m.content?.includes('ổn')),
      'expected a reassuring "everything is fine" bubble',
    );
  });

  test('urgent items map to ALERT bubbles with correctly mapped severity', () => {
    const messages = buildProactiveGreeting(
      baseDashboard({
        urgentItems: [
          urgentItem({ id: 'a', priority: 'LOW' }),
          urgentItem({ id: 'b', priority: 'MEDIUM' }),
          urgentItem({ id: 'c', priority: 'HIGH' }),
          urgentItem({ id: 'd', priority: 'URGENT' }),
        ],
      }),
    );
    const alerts = messages.filter((m) => m.type === 'ALERT');
    // capped at 3, even though 4 were provided
    assertEqual(alerts.length, 3);
    assertEqual(alerts[0].severity, 'LOW');
    assertEqual(alerts[1].severity, 'MEDIUM');
    assertEqual(alerts[2].severity, 'HIGH');
  });

  test('the urgent-items intro bubble reports the true total, not the capped count shown', () => {
    const messages = buildProactiveGreeting(
      baseDashboard({
        urgentItems: [
          urgentItem({ id: 'a' }),
          urgentItem({ id: 'b' }),
          urgentItem({ id: 'c' }),
          urgentItem({ id: 'd' }),
          urgentItem({ id: 'e' }),
        ],
      }),
    );
    const intro = messages.find((m) => m.type === 'TEXT' && m.content?.includes('lưu ý'));
    assert(!!intro, 'expected an intro bubble');
    assert(intro!.content!.includes('5'), 'intro must mention the true total (5), not the capped 3');
  });

  test('an urgent item with a navigation target carries a matching NAVIGATE action', () => {
    const messages = buildProactiveGreeting(
      baseDashboard({
        urgentItems: [
          urgentItem({
            id: 'a',
            navigation: { type: 'NAVIGATE', route: '/payments/approval', label: 'Xem phê duyệt', entityType: 'Approval', entityId: 'AP-1' },
          }),
        ],
      }),
    );
    const alert = messages.find((m) => m.type === 'ALERT');
    assert(!!alert, 'expected one ALERT message');
    assertEqual(alert!.actions?.[0].route, '/payments/approval');
    assertEqual(alert!.actions?.[0].entityId, 'AP-1');
  });

  test('an urgent item without a navigation target carries no actions', () => {
    const messages = buildProactiveGreeting(baseDashboard({ urgentItems: [urgentItem({ id: 'a' })] }));
    const alert = messages.find((m) => m.type === 'ALERT');
    assert(!!alert, 'expected one ALERT message');
    assertEqual(alert!.actions, undefined);
  });
});
