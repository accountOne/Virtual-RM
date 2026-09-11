import { resolveStatus } from '../src/semantic/status-resolver';
import { stripDiacritics } from '../src/semantic/normalizer';
import { assertEqual, describe, test } from './test-runner';
import fs from 'fs';
import path from 'path';

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'business-semantics', 'status-definitions.json'), 'utf-8'));

function norm(s: string): string {
  return stripDiacritics(s.toLowerCase());
}

describe('status resolution (15 required)', () => {
  test('"chờ duyệt" -> PENDING_APPROVAL', () => {
    assertEqual(resolveStatus(norm('giao dịch đang chờ duyệt'), pack), 'PENDING_APPROVAL');
  });
  test('"cần duyệt" -> PENDING_APPROVAL', () => {
    assertEqual(resolveStatus(norm('có giao dịch nào cần duyệt không'), pack), 'PENDING_APPROVAL');
  });
  test('"đang chờ" -> PENDING', () => {
    assertEqual(resolveStatus(norm('lệnh đang chờ xử lý'), pack), 'PENDING');
  });
  test('"đang xử lý" -> PROCESSING', () => {
    assertEqual(resolveStatus(norm('hồ sơ đang xử lý'), pack), 'PROCESSING');
  });
  test('"hoàn tất" -> COMPLETED', () => {
    assertEqual(resolveStatus(norm('giao dịch đã hoàn tất'), pack), 'COMPLETED');
  });
  test('"thành công" -> COMPLETED', () => {
    assertEqual(resolveStatus(norm('thanh toán thành công'), pack), 'COMPLETED');
  });
  test('"đã hoàn thành" -> COMPLETED', () => {
    assertEqual(resolveStatus(norm('việc đã hoàn thành'), pack), 'COMPLETED');
  });
  test('"thất bại" -> FAILED', () => {
    assertEqual(resolveStatus(norm('lệnh chuyển tiền thất bại'), pack), 'FAILED');
  });
  test('"lỗi" -> FAILED', () => {
    assertEqual(resolveStatus(norm('giao dịch bị lỗi'), pack), 'FAILED');
  });
  test('"bị từ chối" -> REJECTED', () => {
    assertEqual(resolveStatus(norm('giao dịch bị từ chối'), pack), 'REJECTED');
  });
  test('"đã hủy" -> CANCELLED', () => {
    assertEqual(resolveStatus(norm('lệnh đã hủy'), pack), 'CANCELLED');
  });
  test('"hết hạn" -> EXPIRED', () => {
    assertEqual(resolveStatus(norm('thư tín dụng đã hết hạn'), pack), 'EXPIRED');
  });
  test('"còn hiệu lực" -> ACTIVE', () => {
    assertEqual(resolveStatus(norm('LC còn hiệu lực không'), pack), 'ACTIVE');
  });
  test('"quá hạn" -> OVERDUE', () => {
    assertEqual(resolveStatus(norm('khoản phải thu đã quá hạn'), pack), 'OVERDUE');
  });
  test('no status phrase present -> undefined', () => {
    assertEqual(resolveStatus(norm('tỷ giá usd hôm nay bao nhiêu'), pack), undefined);
  });
  test('"chuyển" never false-positives as "hủy" (CANCELLED) — regression for a real reported bug', () => {
    // stripDiacritics("hủy") = "huy", which is a literal substring of stripDiacritics("chuyển")
    // = "chuyen" (c-H-U-Y-en). A naive .includes() check used to resolve "Tôi muốn chuyển tiền"
    // to a phantom CANCELLED status, which cascaded into resolving the wrong intent
    // (PAYMENT_STATUS instead of PAYMENT_CREATE).
    assertEqual(resolveStatus(norm('tôi muốn chuyển tiền'), pack), undefined);
    assertEqual(resolveStatus(norm('lập lệnh chuyển khoản mới'), pack), undefined);
  });
  test('a real standalone "hủy" is still resolved correctly after the word-boundary fix', () => {
    assertEqual(resolveStatus(norm('tôi muốn hủy giao dịch'), pack), 'CANCELLED');
    assertEqual(resolveStatus(norm('lệnh chuyển tiền bị hủy'), pack), 'CANCELLED');
  });
});
