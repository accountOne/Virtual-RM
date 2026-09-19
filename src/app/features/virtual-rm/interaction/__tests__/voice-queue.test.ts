import { RMMessage } from '../rm-interaction.types';
import { resolvePriority, resolveSpokenText } from '../rm-voice-queue.service';
import { assert, assertEqual, describe, test } from './test-runner';

function rmMessage(overrides: Partial<RMMessage> = {}): RMMessage {
  return { id: 'm1', from: 'RM', type: 'TEXT', timestamp: Date.now(), ...overrides };
}

describe('rm-voice-queue — resolveSpokenText (the single "what may be spoken" decision point)', () => {
  test('a USER message is never spoken, even if it looks eligible', () => {
    assertEqual(resolveSpokenText(rmMessage({ from: 'USER', content: 'Xin chào' })), null);
  });

  test('voice.enabled === false silences the message even for an otherwise-eligible type', () => {
    assertEqual(resolveSpokenText(rmMessage({ content: 'Xin chào anh/chị', voice: { enabled: false } })), null);
  });

  test('explicit voice.spokenText is preferred over content', () => {
    const text = resolveSpokenText(rmMessage({ content: 'nội dung hiển thị', voice: { enabled: true, spokenText: 'nội dung để đọc' } }));
    assertEqual(text, 'nội dung để đọc');
  });

  test('a default-eligible type (TEXT) with content but no explicit voice metadata still speaks (RM Q&A replies)', () => {
    const text = resolveSpokenText(rmMessage({ type: 'TEXT', content: 'Số dư hiện tại là 1 tỷ đồng.' }));
    assertEqual(text, 'Số dư hiện tại là 1 tỷ đồng.');
  });

  test('a presentational-only type (METRIC) with no explicit opt-in is never spoken', () => {
    assertEqual(resolveSpokenText(rmMessage({ type: 'METRIC', content: 'should never speak' })), null);
  });

  test('a QUICK_REPLY (suggestion chips) is never spoken by default', () => {
    assertEqual(resolveSpokenText(rmMessage({ type: 'QUICK_REPLY', quickReplies: ['Q1'] })), null);
  });

  test('a button/CTA-only ACTION message with no content is never spoken (nothing to say, not the button label)', () => {
    const msg = rmMessage({ type: 'ACTION', actions: [{ label: 'Xác nhận', type: 'CONFIRM' }] });
    assertEqual(resolveSpokenText(msg), null);
  });

  test('an ACTION message WITH content speaks the content, never the button labels', () => {
    const msg = rmMessage({
      type: 'ACTION',
      content: 'Yêu cầu chuyển 50 triệu đồng đã được tạo. Vui lòng kiểm tra và xác nhận.',
      actions: [{ label: 'Xác nhận', type: 'CONFIRM' }, { label: 'Chỉnh sửa', type: 'CONFIRM' }],
    });
    const text = resolveSpokenText(msg);
    assertEqual(text, 'Yêu cầu chuyển 50 triệu đồng đã được tạo. Vui lòng kiểm tra và xác nhận.');
    assert(!text!.includes('Xác nhận') || text === 'Yêu cầu chuyển 50 triệu đồng đã được tạo. Vui lòng kiểm tra và xác nhận.', 'button labels must never leak into spoken text');
  });

  test('a presentational type CAN be spoken when explicitly opted in with voice.enabled + spokenText', () => {
    const msg = rmMessage({ type: 'METRIC', content: 'ignored', voice: { enabled: true, spokenText: 'Số dư 1 tỷ đồng.' } });
    assertEqual(resolveSpokenText(msg), 'Số dư 1 tỷ đồng.');
  });

  test('empty/whitespace-only content resolves to null', () => {
    assertEqual(resolveSpokenText(rmMessage({ type: 'TEXT', content: '   ' })), null);
    assertEqual(resolveSpokenText(rmMessage({ type: 'TEXT', content: undefined })), null);
  });

  test('emoji, markdown emphasis and stray HTML are stripped from the spoken text', () => {
    const text = resolveSpokenText(rmMessage({ type: 'TEXT', content: '⚠️ **Số dư** không đủ <b>để</b> thực hiện giao dịch.' }));
    assertEqual(text, 'Số dư không đủ để thực hiện giao dịch.');
  });
});

describe('rm-voice-queue — resolvePriority', () => {
  test('explicit voice.priority always wins', () => {
    assertEqual(resolvePriority(rmMessage({ type: 'TEXT', voice: { enabled: true, priority: 'critical' } })), 'critical');
  });

  test('ALERT + CRITICAL severity -> critical', () => {
    assertEqual(resolvePriority(rmMessage({ type: 'ALERT', severity: 'CRITICAL' })), 'critical');
  });

  test('ALERT + HIGH severity -> important', () => {
    assertEqual(resolvePriority(rmMessage({ type: 'ALERT', severity: 'HIGH' })), 'important');
  });

  test('ACTION and CONFIRMATION types -> important', () => {
    assertEqual(resolvePriority(rmMessage({ type: 'ACTION' })), 'important');
    assertEqual(resolvePriority(rmMessage({ type: 'CONFIRMATION' })), 'important');
  });

  test('a plain TEXT reply -> normal', () => {
    assertEqual(resolvePriority(rmMessage({ type: 'TEXT' })), 'normal');
  });
});
