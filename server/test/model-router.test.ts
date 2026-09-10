import { describe, test, assertEqual } from './test-runner';
import { routeQuery } from '../src/ai/model-router';
import { AIConfig } from '../src/ai/types';

const enabledConfig: AIConfig = { provider: 'mock', reasoningEnabled: true, maxSteps: 6, confidenceThreshold: 0.65 };
const disabledConfig: AIConfig = { ...enabledConfig, reasoningEnabled: false };

describe('model router (20 required)', () => {
  // ---- Simple queries stay on the deterministic path -------------------------------------
  test('ACCOUNT_BALANCE stays simple', () => {
    const r = routeQuery('Số dư tài khoản hiện tại là bao nhiêu?', 'ACCOUNT_BALANCE', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('ACCOUNT_HIGHEST_BALANCE stays simple', () => {
    const r = routeQuery('Tài khoản nào còn nhiều tiền nhất?', 'ACCOUNT_HIGHEST_BALANCE', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('OUTGOING_PAYMENT stays simple', () => {
    const r = routeQuery('Hôm nay công ty chi bao nhiêu?', 'OUTGOING_PAYMENT', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('LC_EXPIRY stays simple', () => {
    const r = routeQuery('LC nào sắp hết hạn?', 'LC_EXPIRY', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('FX_RATE stays simple', () => {
    const r = routeQuery('Tỷ giá USD hôm nay?', 'FX_RATE', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('APPROVAL_PENDING stays simple', () => {
    const r = routeQuery('Tôi còn giao dịch nào cần duyệt không?', 'APPROVAL_PENDING', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('LOAN_OUTSTANDING stays simple', () => {
    const r = routeQuery('Dư nợ hiện tại bao nhiêu?', 'LOAN_OUTSTANDING', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('CREDIT_LIMIT stays simple', () => {
    const r = routeQuery('Room tín dụng còn bao nhiêu?', 'CREDIT_LIMIT', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('CASH_POSITION without idle-cash wording stays simple', () => {
    const r = routeQuery('Thanh khoản hiện tại của công ty là bao nhiêu?', 'CASH_POSITION', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('PRODUCT_RECOMMEND without cashflow wording stays simple', () => {
    const r = routeQuery('RM gợi ý sản phẩm gì cho công ty tôi?', 'PRODUCT_RECOMMEND', enabledConfig);
    assertEqual(r.reasoningRequired, false);
  });

  // ---- Reasoning queries -------------------------------------------------------------------
  test('CASH_FLOW_SUMMARY routes to CASHFLOW_ANALYSIS', () => {
    const r = routeQuery('Dòng tiền tháng này thế nào?', 'CASH_FLOW_SUMMARY', enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'CASHFLOW_ANALYSIS');
  });
  test('CASH_FLOW_COMPARE routes to CASHFLOW_ANALYSIS', () => {
    const r = routeQuery('Tháng này dòng tiền tăng hay giảm so với tháng trước?', 'CASH_FLOW_COMPARE', enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'CASHFLOW_ANALYSIS');
  });
  test('"đủ tiền trả các khoản sắp tới" routes to LIQUIDITY_ANALYSIS regardless of resolved intent', () => {
    const r = routeQuery('Công ty có đủ tiền trả các khoản phải trả trong 30 ngày tới không?', 'CLARIFICATION_NEEDED', enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'LIQUIDITY_ANALYSIS');
  });
  test('idle-cash wording on CASH_POSITION routes to IDLE_CASH_ANALYSIS', () => {
    const r = routeQuery('Tôi có khoản tiền nhàn rỗi nào không?', 'CASH_POSITION', enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'IDLE_CASH_ANALYSIS');
  });
  test('"ưu tiên thanh toán" routes to PAYMENT_PRIORITIZATION', () => {
    const r = routeQuery('Tuần này tôi nên ưu tiên thanh toán khoản nào?', undefined, enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'PAYMENT_PRIORITIZATION');
  });
  test('"nên duyệt giao dịch nào trước" routes to APPROVAL_PRIORITIZATION', () => {
    const r = routeQuery('Hôm nay tôi nên duyệt giao dịch nào trước?', undefined, enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'APPROVAL_PRIORITIZATION');
  });
  test('cashflow-flavored PRODUCT_RECOMMEND routes to PRODUCT_RECOMMENDATION_REASONING', () => {
    const r = routeQuery('Có sản phẩm nào phù hợp với dòng tiền hiện tại của công ty không?', 'PRODUCT_RECOMMEND', enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'PRODUCT_RECOMMENDATION_REASONING');
  });
  test('"có nên chuyển bớt sang tiền gửi" routes to PRODUCT_RECOMMENDATION_REASONING', () => {
    const r = routeQuery('Có nên chuyển bớt sang tiền gửi không?', undefined, enabledConfig);
    assertEqual(r.reasoningRequired, true);
    assertEqual(r.useCase, 'PRODUCT_RECOMMENDATION_REASONING');
  });

  // ---- AI_REASONING_ENABLED kill switch ----------------------------------------------------
  test('AI_REASONING_ENABLED=false forces every query onto the simple path', () => {
    const r = routeQuery('Dòng tiền tháng này thế nào?', 'CASH_FLOW_SUMMARY', disabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
  test('AI_REASONING_ENABLED=false also disables the pure-keyword liquidity trigger', () => {
    const r = routeQuery('Công ty có đủ tiền trả các khoản sắp tới không?', undefined, disabledConfig);
    assertEqual(r.reasoningRequired, false);
  });
});
