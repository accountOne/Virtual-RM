import { describe, test, assertEqual } from './test-runner';
import { _resetConversationContextForTests, resolveCurrencyFollowUp, resolveDocumentFollowUp, setConversationContext } from '../src/ai/conversation-context';

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

  // ---- Trade Finance (Phase 6) — bare document-number follow-up (spec §45) ----------------
  test('a bare LC number after LC_LIST resolves to LC_DETAIL', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'LC_LIST' });
    const r = resolveDocumentFollowUp('LC-2026-001', 'u1');
    assertEqual(r?.intent, 'LC_DETAIL');
    assertEqual(r?.documentId, 'LC-2026-001');
  });

  test('a bare BG number after GUARANTEE_LIST resolves to GUARANTEE_LIST with a documentId', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'GUARANTEE_LIST' });
    const r = resolveDocumentFollowUp('còn BG-2026-013 thì sao', 'u1');
    assertEqual(r?.intent, 'GUARANTEE_LIST');
    assertEqual(r?.documentId, 'BG-2026-013');
  });

  test('an LC number follow-up also fires after the narrower LC intents (LC_DISCREPANCY etc.)', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'LC_DISCREPANCY' });
    const r = resolveDocumentFollowUp('LC-2026-002', 'u1');
    assertEqual(r?.intent, 'LC_DETAIL');
  });

  test('an LC number follow-up also fires right after LC_RISK_PRIORITIZATION (a ranked LC list)', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'LC_RISK_PRIORITIZATION' });
    const r = resolveDocumentFollowUp('LC-2026-001', 'u1');
    assertEqual(r?.intent, 'LC_DETAIL');
    assertEqual(r?.documentId, 'LC-2026-001');
  });

  test('a BG number follow-up also fires right after GUARANTEE_RISK_PRIORITIZATION (a ranked guarantee list)', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'GUARANTEE_RISK_PRIORITIZATION' });
    const r = resolveDocumentFollowUp('BG-2026-013', 'u1');
    assertEqual(r?.intent, 'GUARANTEE_LIST');
    assertEqual(r?.documentId, 'BG-2026-013');
  });

  test('does not fire a document follow-up after an unrelated previous intent', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'ACCOUNT_BALANCE' });
    const r = resolveDocumentFollowUp('LC-2026-001', 'u1');
    assertEqual(r, undefined);
  });

  test('does not fire a document follow-up on a long, fully-formed new question', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'LC_LIST' });
    const r = resolveDocumentFollowUp('Cho tôi biết thêm chi tiết về LC-2026-001 và cả tình hình tài khoản của công ty', 'u1');
    assertEqual(r, undefined);
  });

  test('does not fire a document follow-up when the message has no document number', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'LC_LIST' });
    const r = resolveDocumentFollowUp('còn cái nào khác không', 'u1');
    assertEqual(r, undefined);
  });

  test('an LC number does not fire a follow-up after a guarantee-family intent, and vice versa', () => {
    _resetConversationContextForTests();
    setConversationContext('u1', { lastIntent: 'GUARANTEE_LIST' });
    assertEqual(resolveDocumentFollowUp('LC-2026-001', 'u1'), undefined);
    setConversationContext('u1', { lastIntent: 'LC_LIST' });
    assertEqual(resolveDocumentFollowUp('BG-2026-013', 'u1'), undefined);
  });
});
