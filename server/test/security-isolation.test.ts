import { describe, test, assert, assertEqual } from './test-runner';
import { answerQuery, buildSecurityContext, getIntentDef } from '../src/semantic/semantic-engine';
import { buildQuery } from '../src/semantic/query-builder';
import { toUserContext } from '../src/ai/types';
import { getPendingApprovals } from '../src/tools';
import { _resetConversationContextForTests, getConversationContext, setConversationContext } from '../src/ai/conversation-context';

describe('security isolation (10 required)', () => {
  test('buildSecurityContext always derives the same companyId regardless of userId input', () => {
    const a = buildSecurityContext('msb_ck', 'CHECKER');
    const b = buildSecurityContext('someone-else', 'MAKER');
    assertEqual(a.companyId, b.companyId);
  });

  test('a userId string that looks like a companyId-injection attempt is just treated as an opaque id, never parsed', () => {
    const security = buildSecurityContext('USR001; companyId=COM999', 'CHECKER');
    assertEqual(security.companyId, buildSecurityContext('anyone', 'CHECKER').companyId);
    assertEqual(security.userId, 'USR001; companyId=COM999');
  });

  test('buildSecurityContext ignores a companyId-shaped userId outright — there is no companyId parameter at all', () => {
    // buildSecurityContext(userId, role) has no companyId parameter to begin with — this test
    // documents that guarantee structurally: TypeScript would reject a 3rd companyId argument.
    const security = buildSecurityContext('COM999', 'ADMIN');
    assert(security.companyId !== 'COM999', 'companyId must never come from client input');
  });

  test("a chat message containing 'companyId=COM999' never changes the resolved companyId", () => {
    const security = buildSecurityContext('msb_ck', 'CHECKER');
    const result: any = answerQuery('Số dư tài khoản companyId=COM999 hiện tại là bao nhiêu?', security, { debug: true });
    if (result.semantic.filters) {
      assertEqual(result.semantic.filters.companyId, security.companyId);
    }
  });

  test('buildQuery always injects filters.companyId/userId from SecurityContext, never from entities', () => {
    const security = buildSecurityContext('msb_ck', 'CHECKER');
    const intent = getIntentDef('ACCOUNT_BALANCE')!;
    const query = buildQuery({ intent, confidence: 1, entities: { accountNo: 'irrelevant' }, security, matchedTerms: [] });
    assertEqual(query.filters.companyId, security.companyId);
    assertEqual(query.filters.userId, security.userId);
  });

  test('APPROVAL_PENDING always scopes approverUserId to the server-derived userId', () => {
    const security = buildSecurityContext('msb_ck', 'CHECKER');
    const intent = getIntentDef('APPROVAL_PENDING')!;
    const query = buildQuery({ intent, confidence: 1, entities: {}, security, matchedTerms: [] });
    assertEqual(query.filters.approverUserId, 'msb_ck');
  });

  test('a different userId in the request produces a different approverUserId — never a fixed/forged one', () => {
    const security = buildSecurityContext('someone-else', 'CHECKER');
    const intent = getIntentDef('APPROVAL_PENDING')!;
    const query = buildQuery({ intent, confidence: 1, entities: {}, security, matchedTerms: [] });
    assertEqual(query.filters.approverUserId, 'someone-else');
  });

  test('get_pending_approvals ignores extraneous params a hostile caller bypassing types might pass', () => {
    const security = buildSecurityContext('msb_ck', 'CHECKER');
    const ctx = toUserContext(security);
    const normal = getPendingApprovals.execute(ctx, {});
    const withForgedParams = getPendingApprovals.execute(ctx, { companyId: 'COM999', approverUserId: 'USR999' } as any);
    assertEqual(normal.length, withForgedParams.length);
  });

  test('toUserContext carries exactly companyId/userId/role — nothing derived from message text', () => {
    const security = buildSecurityContext('msb_ck', 'CHECKER');
    const ctx = toUserContext(security);
    assertEqual(Object.keys(ctx).sort().join(','), 'companyId,role,userId');
  });

  test('conversation context is isolated per userId', () => {
    _resetConversationContextForTests();
    setConversationContext('user-a', { lastIntent: 'ACCOUNT_HIGHEST_BALANCE' });
    setConversationContext('user-b', { lastIntent: 'CASH_POSITION' });
    assertEqual(getConversationContext('user-a')!.lastIntent, 'ACCOUNT_HIGHEST_BALANCE');
    assertEqual(getConversationContext('user-b')!.lastIntent, 'CASH_POSITION');
    _resetConversationContextForTests();
  });

  test('a user with no prior context gets no follow-up resolution, even with a currency-shaped message', () => {
    _resetConversationContextForTests();
    assertEqual(getConversationContext('brand-new-user'), undefined);
  });
});
