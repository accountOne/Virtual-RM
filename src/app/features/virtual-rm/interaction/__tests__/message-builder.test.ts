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

  test('records shaped like LC rows (lcNumber/amount/currency/expiryDate) produce ONE RECORD_LIST card instead of separate bubbles', () => {
    const messages = buildRmMessages(
      baseAnswer({
        title: 'LC sắp hết hạn',
        summary: '1 thư tín dụng sắp hết hạn.',
        metrics: [{ label: 'Số LC sắp hết hạn', value: '1' }],
        records: [
          { lcNumber: 'LC-2026-001', type: 'IMPORT', subType: 'SIGHT', amount: 1_800_000_000, currency: 'VND', expiryDate: '2026-09-20' },
        ],
        action: { label: 'Xem danh sách LC', type: 'NAVIGATE', target: 'OPEN_LC' },
        actions: [
          { label: 'Xem LC-2026-001', type: 'NAVIGATE', target: 'OPEN_LC_DETAIL', entityId: 'LC-2026-001' },
          { label: 'Xem tất cả LC', type: 'NAVIGATE', target: 'OPEN_LC' },
        ],
      }),
    );
    assertEqual(messages.length, 1, 'expected exactly one RECORD_LIST message (no separate TEXT/METRIC/ACTION bubbles)');
    const card = messages[0];
    assertEqual(card.type, 'RECORD_LIST');
    assertEqual(card.title, 'LC sắp hết hạn');
    assertEqual(card.badgeCount, '1 LC');
    assertEqual(card.records?.length, 1);
    assertEqual(card.records?.[0].title, 'LC-2026-001');
    assertEqual(card.records?.[0].subtitle, 'Import LC · Trả ngay');
    assertEqual(card.records?.[0].amount, '1.800.000.000 đ');
    assertEqual(card.records?.[0].badge, 'Hết hạn: 20/09/2026');
    assertEqual(card.records?.[0].action?.route, '/trade-finance/lc/LC-2026-001');
    assertEqual(card.actions?.length, 2, 'expected both actions[] entries carried onto the card');
  });

  test('records with no recognizable id field (lcNumber/guaranteeNumber/collectionNumber) fall back to the per-field bubble layout', () => {
    const messages = buildRmMessages(
      baseAnswer({
        summary: 'Có 2 giao dịch lớn nhất tuần này.',
        records: [{ amount: 100 }, { amount: 200 }],
      }),
    );
    assert(
      !messages.some((m) => m.type === 'RECORD_LIST'),
      'unrecognized record shapes must not produce a RECORD_LIST card',
    );
    assertEqual(messages[0].type, 'TEXT');
  });

  test('a RECORD_LIST card still gets a trailing QUICK_REPLY bubble when suggestedQuestions are present', () => {
    const messages = buildRmMessages(
      baseAnswer({
        records: [{ lcNumber: 'LC-2026-001', amount: 1, currency: 'VND' }],
        suggestedQuestions: ['Q1', 'Q2'],
      }),
    );
    assertEqual(messages.map((m) => m.type).join(','), 'RECORD_LIST,QUICK_REPLY');
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

  test('no urgent items -> one reassuring TEXT bubble, no RECORD_LIST card', () => {
    const messages = buildProactiveGreeting(baseDashboard({ urgentItems: [] }));
    assertEqual(messages.filter((m) => m.type === 'RECORD_LIST').length, 0);
    assert(
      messages.some((m) => m.type === 'TEXT' && m.content?.includes('ổn')),
      'expected a reassuring "everything is fine" bubble',
    );
  });

  test('urgent items become ONE RECORD_LIST card ("Việc cần lưu ý"), rows capped at 5', () => {
    const messages = buildProactiveGreeting(
      baseDashboard({
        urgentItems: [
          urgentItem({ id: 'a', priority: 'LOW' }),
          urgentItem({ id: 'b', priority: 'MEDIUM' }),
          urgentItem({ id: 'c', priority: 'HIGH' }),
          urgentItem({ id: 'd', priority: 'URGENT' }),
          urgentItem({ id: 'e', priority: 'LOW' }),
          urgentItem({ id: 'f', priority: 'LOW' }),
        ],
      }),
    );
    const lists = messages.filter((m) => m.type === 'RECORD_LIST');
    assertEqual(lists.length, 1, 'expected exactly one urgent-items card');
    const card = lists[0];
    assertEqual(card.title, '⚠️ Việc cần lưu ý');
    // capped at 5, even though 6 were provided
    assertEqual(card.records?.length, 5);
    assertEqual(card.records?.[0].badgeTone, 'LOW');
    assertEqual(card.records?.[1].badgeTone, 'MEDIUM');
    assertEqual(card.records?.[2].badgeTone, 'HIGH');
    assertEqual(card.records?.[3].badgeTone, 'CRITICAL');
  });

  test('an urgent item with a navigation target carries a matching NAVIGATE action on its row', () => {
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
    const card = messages.find((m) => m.type === 'RECORD_LIST');
    assert(!!card, 'expected the urgent-items card');
    assertEqual(card!.records?.[0].action?.route, '/payments/approval');
    assertEqual(card!.records?.[0].action?.entityId, 'AP-1');
  });

  test('an urgent item without a navigation target carries no row action', () => {
    const messages = buildProactiveGreeting(baseDashboard({ urgentItems: [urgentItem({ id: 'a' })] }));
    const card = messages.find((m) => m.type === 'RECORD_LIST');
    assert(!!card, 'expected the urgent-items card');
    assertEqual(card!.records?.[0].action, undefined);
  });

  test('the greeting always ends with a category-shortcuts ACTION message (LC/Bảo lãnh/Thanh toán/Dòng tiền)', () => {
    const messages = buildProactiveGreeting(baseDashboard());
    const last = messages[messages.length - 1];
    assertEqual(last.type, 'ACTION');
    assertEqual(last.actions?.map((a) => a.label).join(','), 'LC,Bảo lãnh,Thanh toán,Dòng tiền');
    assert(
      last.actions!.every((a) => !!a.icon),
      'every category-shortcut action must carry an icon (renders as a pill chip)',
    );
  });
});
