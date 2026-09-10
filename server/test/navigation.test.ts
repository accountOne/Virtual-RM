import { answerQuery, buildSecurityContext } from '../src/semantic/semantic-engine';
import { assert, assertEqual, assertGreaterOrEqual, describe, test } from './test-runner';
import fs from 'fs';
import path from 'path';

const sec = buildSecurityContext('msb_ck', 'CHECKER');
const navigationActions: { id: string; route: string }[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'business-semantics', 'navigation-actions.json'), 'utf-8'),
);
const routeById = new Map(navigationActions.map((n) => [n.id, n.route]));

function ask(q: string): any {
  return answerQuery(q, sec, {});
}

describe('navigation actions (10 required)', () => {
  test('APPROVAL_PENDING navigates to OPEN_APPROVAL -> /payments/approval', () => {
    const r = ask('Tôi còn giao dịch nào cần duyệt không?');
    assertEqual(r.answer.action.target, 'OPEN_APPROVAL');
    assertEqual(routeById.get('OPEN_APPROVAL'), '/payments/approval');
    assertEqual(r.answer.action.type, 'NAVIGATE');
  });

  test('ACCOUNT_BALANCE navigates to OPEN_ACCOUNT -> /accounts', () => {
    const r = ask('Số dư tài khoản hiện tại là bao nhiêu?');
    assertEqual(r.answer.action.target, 'OPEN_ACCOUNT');
    assertEqual(routeById.get('OPEN_ACCOUNT'), '/accounts');
  });

  test('FX_RATE navigates to OPEN_FX -> /fx', () => {
    const r = ask('Tỷ giá USD hôm nay?');
    assertEqual(r.answer.action.target, 'OPEN_FX');
    assertEqual(routeById.get('OPEN_FX'), '/fx');
  });

  test('LOAN_OUTSTANDING navigates to OPEN_LOAN -> /loans', () => {
    const r = ask('Dư nợ hiện tại bao nhiêu?');
    assertEqual(r.answer.action.target, 'OPEN_LOAN');
    assertEqual(routeById.get('OPEN_LOAN'), '/loans');
  });

  test('CREDIT_LIMIT navigates to OPEN_LOAN -> /loans', () => {
    const r = ask('Room tín dụng còn bao nhiêu?');
    assertEqual(r.answer.action.target, 'OPEN_LOAN');
  });

  test('PRODUCT_RECOMMEND navigates to OPEN_PRODUCT -> /products', () => {
    const r = ask('RM gợi ý sản phẩm gì cho công ty tôi?');
    assertEqual(r.answer.action.target, 'OPEN_PRODUCT');
    assertEqual(routeById.get('OPEN_PRODUCT'), '/products');
  });

  test('LC_EXPIRY navigates to OPEN_LC (mapped to /products — no dedicated LC page in this demo)', () => {
    const r = ask('LC nào sắp hết hạn?');
    assertEqual(r.answer.action.target, 'OPEN_LC');
    assertEqual(routeById.get('OPEN_LC'), '/products');
  });

  test('GREETING navigates to OPEN_DASHBOARD -> /dashboard', () => {
    const r = ask('Xin chào Virtual RM');
    assertEqual(r.answer.action.target, 'OPEN_DASHBOARD');
    assertEqual(routeById.get('OPEN_DASHBOARD'), '/dashboard');
  });

  test('every navigation action returned by the engine resolves to a real route', () => {
    const queries = ['Tôi còn giao dịch nào cần duyệt không?', 'Tỷ giá USD hôm nay?', 'Dư nợ hiện tại bao nhiêu?'];
    for (const q of queries) {
      const r = ask(q);
      const target = r.answer.action?.target;
      assert(!!target && routeById.has(target), `expected a valid navigation target for "${q}"`);
    }
  });

  // Phase 6 added 5 Trade Finance navigation actions (OPEN_LC_DOCUMENTS/_DISCREPANCY/
  // _AMENDMENT, OPEN_GUARANTEE_CLAIM, OPEN_TRADE_FINANCE) on top of the spec's original 16.
  test('navigation-actions.json has at least the 16 actions defined by the spec', () => {
    assertGreaterOrEqual(navigationActions.length, 16);
  });
});
