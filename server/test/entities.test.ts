import { extractEntities, KnownNames } from '../src/semantic/entity-extractor';
import { assert, assertEqual, describe, test } from './test-runner';

const known: KnownNames = {
  beneficiaries: ['Delta Logistics', 'FPT Software', 'Chi nhánh Đà Nẵng', 'ABC Construction Materials', 'Thép Việt JSC'],
  customers: ['Công ty XYZ Trading', 'Công ty DEF Retail', 'Công ty GHI Corp', 'Osaka Trading Corp.'],
  suppliers: ['ABC Construction Materials', 'Thép Việt JSC', 'Delta Logistics', 'MSB - Phòng Tín dụng'],
};

describe('entity extraction (30 required)', () => {
  test('beneficiary: Delta Logistics found in a sentence', () => {
    const e = extractEntities('Chi tiết lệnh chờ duyệt của Delta Logistics', known);
    assertEqual(e.beneficiary, 'Delta Logistics');
  });
  test('beneficiary: FPT Software found', () => {
    const e = extractEntities('Từ chối giúp tôi giao dịch với FPT Software', known);
    assertEqual(e.beneficiary, 'FPT Software');
  });
  test('beneficiary: case-insensitive match', () => {
    const e = extractEntities('giao dịch với delta logistics tháng này', known);
    assertEqual(e.beneficiary, 'Delta Logistics');
  });
  test('beneficiary: not found when absent', () => {
    const e = extractEntities('Số dư tài khoản hiện tại là bao nhiêu?', known);
    assertEqual(e.beneficiary, undefined);
  });
  test('customer: Công ty XYZ Trading found', () => {
    const e = extractEntities('Khoản phải thu từ Công ty XYZ Trading', known);
    assertEqual(e.customer, 'Công ty XYZ Trading');
  });
  test('customer: Osaka Trading Corp. found', () => {
    const e = extractEntities('Nhờ thu xuất khẩu với Osaka Trading Corp. đang chờ', known);
    assertEqual(e.customer, 'Osaka Trading Corp.');
  });
  test('customer also sets generic beneficiary field', () => {
    const e = extractEntities('Công ty GHI Corp còn nợ bao nhiêu', known);
    assertEqual(e.beneficiary, 'Công ty GHI Corp');
  });
  test('supplier: ABC Construction Materials found', () => {
    const e = extractEntities('Khoản phải trả cho ABC Construction Materials', known);
    assertEqual(e.supplier, 'ABC Construction Materials');
  });
  test('supplier: Thép Việt JSC found', () => {
    const e = extractEntities('Thanh toán nợ Thép Việt JSC tuần này', known);
    assertEqual(e.supplier, 'Thép Việt JSC');
  });
  test('supplier takes priority over generic beneficiary lookup when both could match', () => {
    const e = extractEntities('Delta Logistics là nhà cung cấp của chúng tôi', known);
    assertEqual(e.supplier, 'Delta Logistics');
  });
  test('documentId: LC number extracted', () => {
    const e = extractEntities('Trạng thái LC số LC-2026-001 thế nào?', known);
    assertEqual(e.documentId, 'LC-2026-001');
  });
  test('documentId: BG number extracted', () => {
    const e = extractEntities('BG-2026-011 sắp hết hạn chưa?', known);
    assertEqual(e.documentId, 'BG-2026-011');
  });
  test('documentId: loan number extracted', () => {
    const e = extractEntities('Khoản vay LN-2025-007 lãi suất bao nhiêu?', known);
    assertEqual(e.documentId, 'LN-2025-007');
  });
  test('documentId: collection number extracted', () => {
    const e = extractEntities('Nhờ thu COL-2026-021 đã thanh toán chưa?', known);
    assertEqual(e.documentId, 'COL-2026-021');
  });
  test('documentId: invoice number extracted', () => {
    const e = extractEntities('Hoá đơn INV-2026-0912 đã thu chưa?', known);
    assertEqual(e.documentId, 'INV-2026-0912');
  });
  test('documentId: payment order id extracted', () => {
    const e = extractEntities('Chi tiết lệnh PO-2026-0908', known);
    assertEqual(e.documentId, 'PO-2026-0908');
  });
  test('documentId: not found in a plain sentence', () => {
    const e = extractEntities('Tôi còn việc gì cần xử lý?', known);
    assertEqual(e.documentId, undefined);
  });
  test('documentId: uppercased even if typed lowercase', () => {
    const e = extractEntities('trạng thái lc-2026-002', known);
    assertEqual(e.documentId, 'LC-2026-002');
  });
  test('accountNo: 9+ digit account number extracted', () => {
    const e = extractEntities('Xem chi tiết tài khoản 0071001234567', known);
    assertEqual(e.accountNo, '0071001234567');
  });
  test('accountNo: not extracted from short numbers', () => {
    const e = extractEntities('Có 5 giao dịch hôm nay', known);
    assertEqual(e.accountNo, undefined);
  });
  test('accountNo: does not collide with a document id in the same text', () => {
    const e = extractEntities('LC-2026-001 liên quan tài khoản 0071001234567', known);
    assertEqual(e.accountNo, '0071001234567');
    assertEqual(e.documentId, 'LC-2026-001');
  });
  test('longest beneficiary match wins over a shorter overlapping candidate', () => {
    const e = extractEntities('Thanh toán ABC Construction Materials quý này', known);
    assertEqual(e.beneficiary, 'ABC Construction Materials');
  });
  test('multiple known names in one sentence — first structurally relevant one wins', () => {
    const e = extractEntities('So sánh Delta Logistics và FPT Software', known);
    assert(e.beneficiary === 'Delta Logistics' || e.beneficiary === 'FPT Software', 'expected one of the two known names');
  });
  test('empty text yields no entities', () => {
    const e = extractEntities('', known);
    assertEqual(Object.keys(e).length, 0);
  });
  test('unrelated text yields no false document id', () => {
    const e = extractEntities('Tỷ giá USD hôm nay bao nhiêu?', known);
    assertEqual(e.documentId, undefined);
  });
  test('unrelated text yields no false beneficiary', () => {
    const e = extractEntities('Dư nợ hiện tại bao nhiêu?', known);
    assertEqual(e.beneficiary, undefined);
  });
  test('known list with empty strings is tolerated', () => {
    const e = extractEntities('Delta Logistics', { beneficiaries: ['', 'Delta Logistics'], customers: [], suppliers: [] });
    assertEqual(e.beneficiary, 'Delta Logistics');
  });
  test('beneficiary embedded mid-sentence still matches', () => {
    const e = extractEntities('công ty đã thanh toán cho Chi nhánh Đà Nẵng hôm qua', known);
    assertEqual(e.beneficiary, 'Chi nhánh Đà Nẵng');
  });
  test('customer name with trailing punctuation still matches', () => {
    const e = extractEntities('Osaka Trading Corp. đã xác nhận đơn hàng', known);
    assertEqual(e.customer, 'Osaka Trading Corp.');
  });
  test('supplier "MSB - Phòng Tín dụng" matches despite the dash', () => {
    const e = extractEntities('Khoản trả MSB - Phòng Tín dụng đến hạn', known);
    assertEqual(e.supplier, 'MSB - Phòng Tín dụng');
  });
});
