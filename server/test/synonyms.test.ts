import { normalize, stripDiacritics } from '../src/semantic/normalizer';
import { assert, describe, test } from './test-runner';
import fs from 'fs';
import path from 'path';

const synonyms: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'business-semantics', 'synonyms.json'), 'utf-8'),
);
const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'business-semantics', 'semantic-rules.json'), 'utf-8'),
);

describe('synonym dictionary (30 required)', () => {
  test('synonyms.json has at least 30 concepts', () => {
    assert(Object.keys(synonyms).length >= 30, 'expected >= 30 concepts');
  });
  test('every concept has at least one term', () => {
    for (const [concept, terms] of Object.entries(synonyms)) {
      assert(terms.length > 0, concept + ' has no terms');
    }
  });
  test('concept "account": term "tài khoản" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về tài khoản của công ty', rules);
    const term = stripDiacritics('tài khoản'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "balance": term "số dư" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về số dư của công ty', rules);
    const term = stripDiacritics('số dư'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "availableBalance": term "số dư khả dụng" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về số dư khả dụng của công ty', rules);
    const term = stripDiacritics('số dư khả dụng'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "transaction": term "giao dịch" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về giao dịch của công ty', rules);
    const term = stripDiacritics('giao dịch'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "payment": term "thanh toán" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về thanh toán của công ty', rules);
    const term = stripDiacritics('thanh toán'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "beneficiary": term "người thụ hưởng" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về người thụ hưởng của công ty', rules);
    const term = stripDiacritics('người thụ hưởng'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "approval": term "duyệt" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về duyệt của công ty', rules);
    const term = stripDiacritics('duyệt'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "task": term "việc cần làm" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về việc cần làm của công ty', rules);
    const term = stripDiacritics('việc cần làm'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "alert": term "cảnh báo" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về cảnh báo của công ty', rules);
    const term = stripDiacritics('cảnh báo'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "incoming": term "tiền vào" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về tiền vào của công ty', rules);
    const term = stripDiacritics('tiền vào'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "outgoing": term "tiền ra" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về tiền ra của công ty', rules);
    const term = stripDiacritics('tiền ra'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "cashFlow": term "dòng tiền" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về dòng tiền của công ty', rules);
    const term = stripDiacritics('dòng tiền'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "receivable": term "khoản phải thu" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về khoản phải thu của công ty', rules);
    const term = stripDiacritics('khoản phải thu'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "payable": term "khoản phải trả" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về khoản phải trả của công ty', rules);
    const term = stripDiacritics('khoản phải trả'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "payroll": term "trả lương" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về trả lương của công ty', rules);
    const term = stripDiacritics('trả lương'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "loan": term "khoản vay" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về khoản vay của công ty', rules);
    const term = stripDiacritics('khoản vay'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "creditLimit": term "hạn mức tín dụng" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về hạn mức tín dụng của công ty', rules);
    const term = stripDiacritics('hạn mức tín dụng'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "fxRate": term "tỷ giá" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về tỷ giá của công ty', rules);
    const term = stripDiacritics('tỷ giá'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "fxDeal": term "giao dịch ngoại tệ" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về giao dịch ngoại tệ của công ty', rules);
    const term = stripDiacritics('giao dịch ngoại tệ'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "letterOfCredit": term "LC" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về LC của công ty', rules);
    const term = stripDiacritics('LC'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "bankGuarantee": term "bảo lãnh" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về bảo lãnh của công ty', rules);
    const term = stripDiacritics('bảo lãnh'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "collection": term "nhờ thu" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về nhờ thu của công ty', rules);
    const term = stripDiacritics('nhờ thu'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "expirySoon": term "sắp hết hạn" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về sắp hết hạn của công ty', rules);
    const term = stripDiacritics('sắp hết hạn'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "product": term "sản phẩm" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về sản phẩm của công ty', rules);
    const term = stripDiacritics('sản phẩm'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "recommendation": term "gợi ý" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về gợi ý của công ty', rules);
    const term = stripDiacritics('gợi ý'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "company": term "công ty" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về công ty của công ty', rules);
    const term = stripDiacritics('công ty'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "time": term "hôm nay" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về hôm nay của công ty', rules);
    const term = stripDiacritics('hôm nay'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "amount": term "trên" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về trên của công ty', rules);
    const term = stripDiacritics('trên'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "status": term "trạng thái" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về trạng thái của công ty', rules);
    const term = stripDiacritics('trạng thái'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
  test('concept "greeting": term "xin chào" is found after normalizing a sentence containing it', () => {
    const sentence = normalize('xin hỏi về xin chào của công ty', rules);
    const term = stripDiacritics('xin chào'.toLowerCase());
    assert(sentence.includes(term), 'expected normalized sentence to contain "' + term + '"');
  });
});
