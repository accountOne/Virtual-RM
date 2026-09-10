import { describe, test, assertEqual } from './test-runner';
import { _resetConversationContextForTests, resolveCurrencyFollowUp, setConversationContext } from '../src/ai/conversation-context';

describe('multi-turn conversation context (10 required)', () => {
  test('a currency follow-up after ACCOUNT_HIGHEST_BALANCE replays that intent', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_HIGHEST_BALANCE' });
    const r = resolveCurrencyFollowUp('Còn tài khoản USD?', 'u1');
    assertEqual(r?.intent, 'ACCOUNT_HIGHEST_BALANCE');
    assertEqual(r?.currency, 'USD');
  });

  test('a currency follow-up after ACCOUNT_BALANCE replays that intent', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_BALANCE' });
    const r = resolveCurrencyFollowUp('EUR thì sao?', 'u1');
    assertEqual(r?.intent, 'ACCOUNT_BALANCE');
    assertEqual(r?.currency, 'EUR');
  });

  test('a currency follow-up after ACCOUNT_LOWEST_BALANCE replays that intent', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_LOWEST_BALANCE' });
    const r = resolveCurrencyFollowUp('VND thì sao', 'u1');
    assertEqual(r?.intent, 'ACCOUNT_LOWEST_BALANCE');
  });

  test('does not fire with no prior context', () => {
    _resetConversationContextForTests();
    const r = resolveCurrencyFollowUp('Còn tài khoản USD?', 'brand-new-user');
    assertEqual(r, undefined);
  });

  test('does not fire after a non-balance intent', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'CASH_POSITION' });
    const r = resolveCurrencyFollowUp('Còn tài khoản USD?', 'u1');
    assertEqual(r, undefined);
  });

  test('does not fire when the message has no currency code', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_BALANCE' });
    const r = resolveCurrencyFollowUp('Còn tài khoản nào khác không?', 'u1');
    assertEqual(r, undefined);
  });

  test('does not fire on a long, fully-formed new question even if it mentions a currency', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_BALANCE' });
    const r = resolveCurrencyFollowUp('Tôi muốn xem tất cả giao dịch bằng USD trong tháng này của công ty', 'u1');
    assertEqual(r, undefined);
  });

  test('recognizes multiple currency codes (JPY)', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_AVAILABLE_BALANCE' });
    const r = resolveCurrencyFollowUp('JPY?', 'u1');
    assertEqual(r?.currency, 'JPY');
  });

  test('setConversationContext overwrites the previous state for the same user', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_BALANCE' });
    setConversationContext('u1', { lastIntent: 'CASH_POSITION' });
    const r = resolveCurrencyFollowUp('USD?', 'u1');
    assertEqual(r, undefined); // CASH_POSITION is not a currency-followup intent
  });

  test('two users never see each other\'s conversation state', () => {
    _resetConversationContextForTests();
    setConversationContext('alice', { lastIntent: 'ACCOUNT_HIGHEST_BALANCE' });
    const r = resolveCurrencyFollowUp('USD?', 'bob');
    assertEqual(r, undefined);
    _resetConversationContextForTests();
  });
});
