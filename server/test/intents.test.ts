import { answerQuery, buildSecurityContext } from '../src/semantic/semantic-engine';
import { assertEqual, describe, test } from './test-runner';

const sec = buildSecurityContext('msb_ck', 'CHECKER');

// Each query below was verified against the running engine (business-semantics pack as
// checked in) to actually resolve to the stated intent — this is a real regression suite,
// not aspirational. 4 of the 50 intents (PAYMENT_PENDING, TRANSACTION_DETAIL,
// TRANSACTION_BY_DATE, TRANSACTION_SUMMARY's sibling TRANSACTION_LIST-adjacent overlaps, and
// a couple of intrinsically ambiguous phrasings with no domain anchor) remain genuinely hard
// to separate from a sibling with pure deterministic keyword matching, or need an entity id
// shape the demo data doesn't produce (TRANSACTION_DETAIL/TRANSACTION_BY_DATE need a
// documentId the entity-extractor's regex recognizes, and transaction ids in this demo don't
// match it) — see docs/semantic-engine.md #Known limitations.
describe('intent detection (50+ required)', () => {
  test('ACCOUNT_BALANCE <- "Số dư tài khoản hiện tại là bao nhiêu?"', () => {
    const r: any = answerQuery('Số dư tài khoản hiện tại là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_BALANCE');
  });
  test('ACCOUNT_BALANCE <- "Số dư tài khoản ngoại tệ USD hiện tại?"', () => {
    const r: any = answerQuery('Số dư tài khoản ngoại tệ USD hiện tại?', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_BALANCE');
  });
  test('ACCOUNT_BALANCE <- "tiền còn trong tài khoản"', () => {
    const r: any = answerQuery('tiền còn trong tài khoản', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_BALANCE');
  });
  test('ACCOUNT_HIGHEST_BALANCE <- "Tài khoản nào còn nhiều tiền nhất?"', () => {
    const r: any = answerQuery('Tài khoản nào còn nhiều tiền nhất?', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_HIGHEST_BALANCE');
  });
  test('ACCOUNT_HIGHEST_BALANCE <- "nhiều tiền nhất"', () => {
    const r: any = answerQuery('nhiều tiền nhất', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_HIGHEST_BALANCE');
  });
  test('ACCOUNT_LOWEST_BALANCE <- "TK nào ít tiền nhất vậy?"', () => {
    const r: any = answerQuery('TK nào ít tiền nhất vậy?', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_LOWEST_BALANCE');
  });
  test('ACCOUNT_LOWEST_BALANCE <- "số dư thấp nhất"', () => {
    const r: any = answerQuery('số dư thấp nhất', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_LOWEST_BALANCE');
  });
  test('ACCOUNT_STATEMENT <- "Sao kê tài khoản tháng này"', () => {
    const r: any = answerQuery('Sao kê tài khoản tháng này', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_STATEMENT');
  });
  // This phrase concatenates an "account" concept term with a "transaction" concept term
  // purely to force a tie win by priority — it never actually said "sao kê" (statement).
  // ACCOUNT_STATEMENT now has its own "statement" concept (see docs/semantic-engine.md #Known
  // limitations), so a genuinely generic account question correctly falls to ACCOUNT_LIST.
  test('ACCOUNT_LIST <- "tài khoản doanh nghiệp giao dịch trên tài khoản"', () => {
    const r: any = answerQuery('tài khoản doanh nghiệp giao dịch trên tài khoản', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_LIST');
  });
  test('ACCOUNT_STATEMENT <- "Cho tôi sao kê giao dịch tài khoản công ty tháng này"', () => {
    const r: any = answerQuery('Cho tôi sao kê giao dịch tài khoản công ty tháng này', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_STATEMENT');
  });
  test('ACCOUNT_DETAIL <- "Xem chi tiết tài khoản 0071001234567 giúp tôi"', () => {
    const r: any = answerQuery('Xem chi tiết tài khoản 0071001234567 giúp tôi', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_DETAIL');
  });
  test('ACCOUNT_AVAILABLE_BALANCE <- "Available balance của account VND là bao nhiêu?"', () => {
    const r: any = answerQuery('Available balance của account VND là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_AVAILABLE_BALANCE');
  });
  test('ACCOUNT_AVAILABLE_BALANCE <- "số tiền có thể sử dụng"', () => {
    const r: any = answerQuery('số tiền có thể sử dụng', sec, {});
    assertEqual(r.semantic.intent, 'ACCOUNT_AVAILABLE_BALANCE');
  });
  test('OUTGOING_PAYMENT <- "Hôm qua công ty chi bao nhiêu?"', () => {
    const r: any = answerQuery('Hôm qua công ty chi bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'OUTGOING_PAYMENT');
  });
  test('OUTGOING_PAYMENT <- "tiền đã chuyển đi"', () => {
    const r: any = answerQuery('tiền đã chuyển đi', sec, {});
    assertEqual(r.semantic.intent, 'OUTGOING_PAYMENT');
  });
  test('INCOMING_PAYMENT <- "Tuần này tiền về bao nhiêu rồi?"', () => {
    const r: any = answerQuery('Tuần này tiền về bao nhiêu rồi?', sec, {});
    assertEqual(r.semantic.intent, 'INCOMING_PAYMENT');
  });
  test('INCOMING_PAYMENT <- "Tổng tiền vào tháng này là bao nhiêu?"', () => {
    const r: any = answerQuery('Tổng tiền vào tháng này là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'INCOMING_PAYMENT');
  });
  test('TRANSACTION_LARGEST <- "Giao dịch nào lớn nhất tháng này?"', () => {
    const r: any = answerQuery('Giao dịch nào lớn nhất tháng này?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_LARGEST');
  });
  test('TRANSACTION_BY_AMOUNT <- "Có giao dịch nào trên 5 tỷ không?"', () => {
    const r: any = answerQuery('Có giao dịch nào trên 5 tỷ không?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
  });
  test('TRANSACTION_BY_AMOUNT <- "Giao dịch dưới 100 triệu tuần trước có bao nhiêu cái?"', () => {
    const r: any = answerQuery('Giao dịch dưới 100 triệu tuần trước có bao nhiêu cái?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
  });
  test('TRANSACTION_BY_AMOUNT <- "Ít nhất 1 tỷ trở lên có giao dịch nào không?"', () => {
    const r: any = answerQuery('Ít nhất 1 tỷ trở lên có giao dịch nào không?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
  });
  test('TRANSACTION_BY_AMOUNT <- "Giao dịch từ 500 triệu đến 2 tỷ tuần này có bao nhiêu?"', () => {
    const r: any = answerQuery('Giao dịch từ 500 triệu đến 2 tỷ tuần này có bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
  });
  test('TRANSACTION_BY_AMOUNT <- "trong khoảng"', () => {
    const r: any = answerQuery('trong khoảng', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_AMOUNT');
  });
  test('TRANSACTION_BY_BENEFICIARY <- "Có giao dịch nào trên 5 tỷ của nhà cung cấp ABC trong tháng này không?"', () => {
    const r: any = answerQuery('Có giao dịch nào trên 5 tỷ của nhà cung cấp ABC trong tháng này không?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_BENEFICIARY');
  });
  test('TRANSACTION_BY_BENEFICIARY <- "3 tháng gần đây công ty chi bao nhiêu cho nhà cung cấp?"', () => {
    const r: any = answerQuery('3 tháng gần đây công ty chi bao nhiêu cho nhà cung cấp?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_BY_BENEFICIARY');
  });
  test('APPROVAL_PENDING <- "Tôi còn giao dịch nào cần duyệt không?"', () => {
    const r: any = answerQuery('Tôi còn giao dịch nào cần duyệt không?', sec, {});
    assertEqual(r.semantic.intent, 'APPROVAL_PENDING');
  });
  test('APPROVAL_PENDING <- "giao dịch chờ phê duyệt"', () => {
    const r: any = answerQuery('giao dịch chờ phê duyệt', sec, {});
    assertEqual(r.semantic.intent, 'APPROVAL_PENDING');
  });
  test('ALERT_HIGH_PRIORITY <- "Cảnh báo nào quan trọng nhất tôi cần xử lý?"', () => {
    const r: any = answerQuery('Cảnh báo nào quan trọng nhất tôi cần xử lý?', sec, {});
    assertEqual(r.semantic.intent, 'ALERT_HIGH_PRIORITY');
  });
  test('ALERT_HIGH_PRIORITY <- "thông báo quan trọng"', () => {
    const r: any = answerQuery('thông báo quan trọng', sec, {});
    assertEqual(r.semantic.intent, 'ALERT_HIGH_PRIORITY');
  });
  test('CASH_FLOW_COMPARE <- "Tháng này dòng tiền tăng hay giảm so với tháng trước?"', () => {
    const r: any = answerQuery('Tháng này dòng tiền tăng hay giảm so với tháng trước?', sec, {});
    assertEqual(r.semantic.intent, 'CASH_FLOW_COMPARE');
  });
  // Bare "dòng tiền doanh nghiệp" has zero comparison wording — it only resolved to
  // CASH_FLOW_COMPARE before via the shared "cashFlow" concept's priority tie-break.
  // CASH_FLOW_COMPARE now has its own "compare" concept (so với, tăng hay giảm, ...), so this
  // falls to the generic CASH_FLOW_SUMMARY, and a real comparison phrase gets its own test.
  test('CASH_FLOW_COMPARE <- "So với tháng trước, chi phí thanh toán tuần này tăng hay giảm?"', () => {
    const r: any = answerQuery('So với tháng trước, chi phí thanh toán tuần này tăng hay giảm?', sec, {});
    assertEqual(r.semantic.intent, 'CASH_FLOW_COMPARE');
  });
  test('PAYROLL_SUMMARY <- "Kỳ lương gần nhất là khi nào?"', () => {
    const r: any = answerQuery('Kỳ lương gần nhất là khi nào?', sec, {});
    assertEqual(r.semantic.intent, 'PAYROLL_SUMMARY');
  });
  test('PAYROLL_SUMMARY <- "Tháng này chi lương bao nhiêu?"', () => {
    const r: any = answerQuery('Tháng này chi lương bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'PAYROLL_SUMMARY');
  });
  test('PAYROLL_SUMMARY <- "Bao nhiêu nhân viên được trả lương kỳ này?"', () => {
    const r: any = answerQuery('Bao nhiêu nhân viên được trả lương kỳ này?', sec, {});
    assertEqual(r.semantic.intent, 'PAYROLL_SUMMARY');
  });
  test('PAYROLL_SUMMARY <- "chi lương hàng loạt"', () => {
    const r: any = answerQuery('chi lương hàng loạt', sec, {});
    assertEqual(r.semantic.intent, 'PAYROLL_SUMMARY');
  });
  test('FX_RATE <- "Tỷ giá USD hôm nay?"', () => {
    const r: any = answerQuery('Tỷ giá USD hôm nay?', sec, {});
    assertEqual(r.semantic.intent, 'FX_RATE');
  });
  test('FX_RATE <- "Tỷ giá USD/VND hôm nay thế nào?"', () => {
    const r: any = answerQuery('Tỷ giá USD/VND hôm nay thế nào?', sec, {});
    assertEqual(r.semantic.intent, 'FX_RATE');
  });
  test('FX_RATE <- "tỷ giá hôm nay"', () => {
    const r: any = answerQuery('tỷ giá hôm nay', sec, {});
    assertEqual(r.semantic.intent, 'FX_RATE');
  });
  test('LC_EXPIRY <- "LC nào sắp hết hạn?"', () => {
    const r: any = answerQuery('LC nào sắp hết hạn?', sec, {});
    assertEqual(r.semantic.intent, 'LC_EXPIRY');
  });
  // Bare "sắp hết hiệu lực" with no domain word is genuinely ambiguous (task/LC/guarantee all
  // plausible) — it only resolved to LC_EXPIRY before because "expirySoon" was one shared
  // concept across all three domains and LC_EXPIRY happened to sort first on a tie. Fixed by
  // splitting expirySoon into per-domain concepts (taskDue/lcExpiry/guaranteeExpiry) that each
  // require their own domain word — see docs/semantic-engine.md #Known limitations.
  test('LC_EXPIRY <- "LC sắp hết hiệu lực"', () => {
    const r: any = answerQuery('LC sắp hết hiệu lực', sec, {});
    assertEqual(r.semantic.intent, 'LC_EXPIRY');
  });
  test('LC_STATUS <- "Trạng thái LC số LC-2026-001 thế nào?"', () => {
    const r: any = answerQuery('Trạng thái LC số LC-2026-001 thế nào?', sec, {});
    assertEqual(r.semantic.intent, 'LC_STATUS');
  });
  test('LC_STATUS <- "thư tín dụng xuất khẩu đang ở trạng thái nào"', () => {
    const r: any = answerQuery('thư tín dụng xuất khẩu đang ở trạng thái nào', sec, {});
    assertEqual(r.semantic.intent, 'LC_STATUS');
  });
  test('LC_DETAIL <- "Chi tiết thư tín dụng LC-2026-002"', () => {
    const r: any = answerQuery('Chi tiết thư tín dụng LC-2026-002', sec, {});
    assertEqual(r.semantic.intent, 'LC_DETAIL');
  });
  // A generic "export LC" mention with no LC number is a list/filter query, not a detail
  // lookup — it only resolved to LC_DETAIL before via the shared "letterOfCredit" concept's
  // priority tie-break. LC_DETAIL now requires an actual documentId (see
  // docs/semantic-engine.md #Known limitations), so this correctly falls to LC_LIST.
  test('LC_LIST <- "thư tín dụng xuất khẩu"', () => {
    const r: any = answerQuery('thư tín dụng xuất khẩu', sec, {});
    assertEqual(r.semantic.intent, 'LC_LIST');
  });
  // "LC"/"BG" are exactly as unambiguous to a real user as "bảo lãnh"/"tài khoản", but score
  // weakly under the single-word-vs-phrase heuristic simply because they're one un-spaced
  // token, not a multi-syllable Vietnamese compound — this used to fall to CLARIFICATION_NEEDED
  // (reported live). The bare-ticker fallback in semantic-engine.ts fixes it, narrowly: only
  // when the ticker is the *sole* match, so "LC nào sắp hết hạn?" above is untouched.
  test('LC_LIST <- bare "LC" (no other signal)', () => {
    const r: any = answerQuery('LC', sec, {});
    assertEqual(r.semantic.intent, 'LC_LIST');
  });
  test('LC_LIST <- "danh sách LC"', () => {
    const r: any = answerQuery('danh sách LC', sec, {});
    assertEqual(r.semantic.intent, 'LC_LIST');
  });
  test('LC_LIST <- bare "L/C"', () => {
    const r: any = answerQuery('L/C', sec, {});
    assertEqual(r.semantic.intent, 'LC_LIST');
  });
  test('GUARANTEE_LIST <- bare "BG"', () => {
    const r: any = answerQuery('BG', sec, {});
    assertEqual(r.semantic.intent, 'GUARANTEE_LIST');
  });
  test('GUARANTEE_LIST <- "Công ty có bao nhiêu bảo lãnh ngân hàng?"', () => {
    const r: any = answerQuery('Công ty có bao nhiêu bảo lãnh ngân hàng?', sec, {});
    assertEqual(r.semantic.intent, 'GUARANTEE_LIST');
  });
  test('GUARANTEE_LIST <- "Bảo lãnh dự thầu nào công ty đang có?"', () => {
    const r: any = answerQuery('Bảo lãnh dự thầu nào công ty đang có?', sec, {});
    assertEqual(r.semantic.intent, 'GUARANTEE_LIST');
  });
  test('GUARANTEE_LIST <- "bảo lãnh thực hiện hợp đồng"', () => {
    const r: any = answerQuery('bảo lãnh thực hiện hợp đồng', sec, {});
    assertEqual(r.semantic.intent, 'GUARANTEE_LIST');
  });
  test('COLLECTION_LIST <- "Nhờ thu nào đang xử lý?"', () => {
    const r: any = answerQuery('Nhờ thu nào đang xử lý?', sec, {});
    assertEqual(r.semantic.intent, 'COLLECTION_LIST');
  });
  test('COLLECTION_LIST <- "Công ty có bao nhiêu bộ chứng từ nhờ thu?"', () => {
    const r: any = answerQuery('Công ty có bao nhiêu bộ chứng từ nhờ thu?', sec, {});
    assertEqual(r.semantic.intent, 'COLLECTION_LIST');
  });
  test('COLLECTION_LIST <- "documentary collection"', () => {
    const r: any = answerQuery('documentary collection', sec, {});
    assertEqual(r.semantic.intent, 'COLLECTION_LIST');
  });
  test('LOAN_OUTSTANDING <- "Dư nợ hiện tại bao nhiêu?"', () => {
    const r: any = answerQuery('Dư nợ hiện tại bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_OUTSTANDING');
  });
  test('LOAN_OUTSTANDING <- "Tổng dư nợ và hạn mức tín dụng còn lại là bao nhiêu?"', () => {
    const r: any = answerQuery('Tổng dư nợ và hạn mức tín dụng còn lại là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_OUTSTANDING');
  });
  test('LOAN_OUTSTANDING <- "dư nợ vay ngân hàng"', () => {
    const r: any = answerQuery('dư nợ vay ngân hàng', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_OUTSTANDING');
  });
  test('CREDIT_LIMIT <- "Room tín dụng còn bao nhiêu?"', () => {
    const r: any = answerQuery('Room tín dụng còn bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'CREDIT_LIMIT');
  });
  test('CREDIT_LIMIT <- "Hạn mức tín dụng của công ty là bao nhiêu?"', () => {
    const r: any = answerQuery('Hạn mức tín dụng của công ty là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'CREDIT_LIMIT');
  });
  test('CREDIT_LIMIT <- "Hạn mức còn lại để vay thêm là bao nhiêu?"', () => {
    const r: any = answerQuery('Hạn mức còn lại để vay thêm là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'CREDIT_LIMIT');
  });
  test('CREDIT_LIMIT <- "hạn mức khả dụng để vay"', () => {
    const r: any = answerQuery('hạn mức khả dụng để vay', sec, {});
    assertEqual(r.semantic.intent, 'CREDIT_LIMIT');
  });
  test('LOAN_LIST <- "Công ty có bao nhiêu khoản vay đang mở?"', () => {
    const r: any = answerQuery('Công ty có bao nhiêu khoản vay đang mở?', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_LIST');
  });
  test('LOAN_LIST <- "Khoản vay nào sắp đến hạn trả?"', () => {
    const r: any = answerQuery('Khoản vay nào sắp đến hạn trả?', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_LIST');
  });
  test('LOAN_LIST <- "Khoản vay 2 tỷ sắp đến hạn thanh toán chưa?"', () => {
    const r: any = answerQuery('Khoản vay 2 tỷ sắp đến hạn thanh toán chưa?', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_LIST');
  });
  test('LOAN_LIST <- "nợ vay ngân hàng"', () => {
    const r: any = answerQuery('nợ vay ngân hàng', sec, {});
    assertEqual(r.semantic.intent, 'LOAN_LIST');
  });
  test('PRODUCT_RECOMMEND <- "Có sản phẩm nào phù hợp với dòng tiền hiện tại của công ty không?"', () => {
    const r: any = answerQuery('Có sản phẩm nào phù hợp với dòng tiền hiện tại của công ty không?', sec, {});
    assertEqual(r.semantic.intent, 'PRODUCT_RECOMMEND');
  });
  test('PRODUCT_RECOMMEND <- "RM gợi ý sản phẩm gì cho công ty tôi?"', () => {
    const r: any = answerQuery('RM gợi ý sản phẩm gì cho công ty tôi?', sec, {});
    assertEqual(r.semantic.intent, 'PRODUCT_RECOMMEND');
  });
  test('PRODUCT_RECOMMEND <- "Sản phẩm nào phù hợp với doanh nghiệp xuất nhập khẩu?"', () => {
    const r: any = answerQuery('Sản phẩm nào phù hợp với doanh nghiệp xuất nhập khẩu?', sec, {});
    assertEqual(r.semantic.intent, 'PRODUCT_RECOMMEND');
  });
  test('PRODUCT_RECOMMEND <- "giải pháp ngân hàng sản phẩm được đề xuất"', () => {
    const r: any = answerQuery('giải pháp ngân hàng sản phẩm được đề xuất', sec, {});
    assertEqual(r.semantic.intent, 'PRODUCT_RECOMMEND');
  });
  test('GREETING <- "Xin chào Virtual RM"', () => {
    const r: any = answerQuery('Xin chào Virtual RM', sec, {});
    assertEqual(r.semantic.intent, 'GREETING');
  });
  test('GREETING <- "Chào buổi sáng nhé"', () => {
    const r: any = answerQuery('Chào buổi sáng nhé', sec, {});
    assertEqual(r.semantic.intent, 'GREETING');
  });
  test('GREETING <- "chào Virtual RM"', () => {
    const r: any = answerQuery('chào Virtual RM', sec, {});
    assertEqual(r.semantic.intent, 'GREETING');
  });
  test('HELP <- "Bạn giúp được gì cho tôi?"', () => {
    const r: any = answerQuery('Bạn giúp được gì cho tôi?', sec, {});
    assertEqual(r.semantic.intent, 'HELP');
  });
  test('HELP <- "bạn làm được những gì"', () => {
    const r: any = answerQuery('bạn làm được những gì', sec, {});
    assertEqual(r.semantic.intent, 'HELP');
  });
  // A generic "what's the status" question with no failure wording ("lỗi"/"từ chối"/"thất
  // bại") isn't evidence of a FAILED transaction — it only resolved to TRANSACTION_FAILED
  // before via the shared "transaction"+"status" concepts' priority tie-break. FAILED now has
  // its own "failed" concept (see docs/semantic-engine.md #Known limitations), so this
  // correctly falls to the generic list, and a real failure phrase gets its own test below.
  test('TRANSACTION_LIST <- "giao dịch trên tài khoản đang ở trạng thái nào"', () => {
    const r: any = answerQuery('giao dịch trên tài khoản đang ở trạng thái nào', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_LIST');
  });
  test('TRANSACTION_FAILED <- "Giao dịch nào bị từ chối gần đây?"', () => {
    const r: any = answerQuery('Giao dịch nào bị từ chối gần đây?', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_FAILED');
  });
  // Same fix as above, on the PAYMENT side: "đang ở trạng thái nào" is exactly what
  // PAYMENT_STATUS exists for (its own description: "Tra cứu trạng thái xử lý của một lệnh
  // thanh toán") — it only lost to PAYMENT_FAILED before via the same shared-concept tie-break.
  test('PAYMENT_STATUS <- "lệnh chuyển tiền đang ở trạng thái nào"', () => {
    const r: any = answerQuery('lệnh chuyển tiền đang ở trạng thái nào', sec, {});
    assertEqual(r.semantic.intent, 'PAYMENT_STATUS');
  });
  test('PAYMENT_FAILED <- "Lệnh thanh toán của tôi bị lỗi rồi"', () => {
    const r: any = answerQuery('Lệnh thanh toán của tôi bị lỗi rồi', sec, {});
    assertEqual(r.semantic.intent, 'PAYMENT_FAILED');
  });
  test('TASK_DUE <- "việc tôi cần làm sắp hết hiệu lực"', () => {
    const r: any = answerQuery('việc tôi cần làm sắp hết hiệu lực', sec, {});
    assertEqual(r.semantic.intent, 'TASK_DUE');
  });
  // This phrase concatenates a "cashFlow" concept term with a "balance" concept term purely to
  // force a tie win by priority — neither is CASH_POSITION-specific vocabulary. CASH_POSITION
  // now has its own "cashPosition" concept (thanh khoản, vị thế tiền mặt, ...), split out from
  // the generic "cashFlow"/"balance" it used to share with CASH_FLOW_SUMMARY/ACCOUNT_BALANCE
  // (see docs/semantic-engine.md #Known limitations), so this falls to the generic summary.
  test('CASH_FLOW_SUMMARY <- "dòng tiền doanh nghiệp tiền còn trong tài khoản"', () => {
    const r: any = answerQuery('dòng tiền doanh nghiệp tiền còn trong tài khoản', sec, {});
    assertEqual(r.semantic.intent, 'CASH_FLOW_SUMMARY');
  });
  test('CASH_POSITION <- "Thanh khoản hiện tại của công ty là bao nhiêu?"', () => {
    const r: any = answerQuery('Thanh khoản hiện tại của công ty là bao nhiêu?', sec, {});
    assertEqual(r.semantic.intent, 'CASH_POSITION');
  });
  // A generic "FX trades" mention with no comparison wording is FX_DEALS territory — it only
  // resolved to FX_EXPOSURE before via the shared "fxDeal" concept's priority tie-break.
  // FX_EXPOSURE now has its own "fxExposure" concept (mua/bán ... nhiều hơn, ...), matching the
  // spec's own canonical example verbatim (docs/semantic-query-examples.md #6).
  test('FX_DEALS <- "giao dịch mua bán ngoại tệ"', () => {
    const r: any = answerQuery('giao dịch mua bán ngoại tệ', sec, {});
    assertEqual(r.semantic.intent, 'FX_DEALS');
  });
  test('FX_EXPOSURE <- "Công ty mua bán ngoại tệ nhiều hơn bên nào?"', () => {
    const r: any = answerQuery('Công ty mua bán ngoại tệ nhiều hơn bên nào?', sec, {});
    assertEqual(r.semantic.intent, 'FX_EXPOSURE');
  });

  // Newly-covered intents: each of these previously lost its scoring tie to a sibling (see
  // the fixes above and docs/semantic-engine.md #requiredSignals) and had no passing test at
  // all before this pass.
  test('PAYMENT_CREATE <- "Tôi muốn chuyển tiền đơn"', () => {
    const r: any = answerQuery('Tôi muốn chuyển tiền đơn', sec, {});
    assertEqual(r.semantic.intent, 'PAYMENT_CREATE');
  });
  test('APPROVAL_APPROVE <- "Tôi muốn phê duyệt giao dịch này"', () => {
    const r: any = answerQuery('Tôi muốn phê duyệt giao dịch này', sec, {});
    assertEqual(r.semantic.intent, 'APPROVAL_APPROVE');
  });
  test('APPROVAL_REJECT <- "Từ chối giúp tôi giao dịch với FPT Software"', () => {
    const r: any = answerQuery('Từ chối giúp tôi giao dịch với FPT Software', sec, {});
    assertEqual(r.semantic.intent, 'APPROVAL_REJECT');
  });
  test('APPROVAL_DETAIL <- "Chi tiết lệnh chờ duyệt của Delta Logistics"', () => {
    const r: any = answerQuery('Chi tiết lệnh chờ duyệt của Delta Logistics', sec, {});
    assertEqual(r.semantic.intent, 'APPROVAL_DETAIL');
  });
  test('TASK_LIST <- "Tôi còn việc gì cần xử lý?"', () => {
    const r: any = answerQuery('Tôi còn việc gì cần xử lý?', sec, {});
    assertEqual(r.semantic.intent, 'TASK_LIST');
  });
  test('ALERT_LIST <- "Có cảnh báo nào không?"', () => {
    const r: any = answerQuery('Có cảnh báo nào không?', sec, {});
    assertEqual(r.semantic.intent, 'ALERT_LIST');
  });
  test('GUARANTEE_EXPIRY <- "Bảo lãnh nào sắp đáo hạn?"', () => {
    const r: any = answerQuery('Bảo lãnh nào sắp đáo hạn?', sec, {});
    assertEqual(r.semantic.intent, 'GUARANTEE_EXPIRY');
  });
  test('PAYMENT_TODAY <- "Hôm nay có bao nhiêu lệnh thanh toán đã lập?"', () => {
    const r: any = answerQuery('Hôm nay có bao nhiêu lệnh thanh toán đã lập?', sec, {});
    assertEqual(r.semantic.intent, 'PAYMENT_TODAY');
  });
  test('TRANSACTION_SUMMARY <- "Tổng hợp giao dịch quý này giúp tôi"', () => {
    const r: any = answerQuery('Tổng hợp giao dịch quý này giúp tôi', sec, {});
    assertEqual(r.semantic.intent, 'TRANSACTION_SUMMARY');
  });
});
