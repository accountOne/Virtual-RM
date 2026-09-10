import { parseAmountFilter } from '../src/semantic/amount-parser';
import { stripDiacritics } from '../src/semantic/normalizer';
import { assertEqual, describe, test } from './test-runner';
import fs from 'fs';
import path from 'path';

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'business-semantics', 'amount-operators.json'), 'utf-8'));

function norm(s: string): string {
  return stripDiacritics(s.toLowerCase());
}

describe('amount parsing (15 required)', () => {
  test('GT: "trên 5 tỷ" -> 5,000,000,000 VND', () => {
    const f = parseAmountFilter(norm('có giao dịch nào trên 5 tỷ không'), pack);
    assertEqual(f?.operator, 'GT');
    assertEqual(f?.value, 5_000_000_000);
    assertEqual(f?.currency, 'VND');
  });

  test('GTE: "ít nhất 1 tỷ" -> 1,000,000,000 VND', () => {
    const f = parseAmountFilter(norm('ít nhất 1 tỷ trở lên có giao dịch nào không'), pack);
    assertEqual(f?.operator, 'GTE');
    assertEqual(f?.value, 1_000_000_000);
  });

  test('LT: "dưới 500 triệu"', () => {
    const f = parseAmountFilter(norm('giao dịch dưới 500 triệu'), pack);
    assertEqual(f?.operator, 'LT');
    assertEqual(f?.value, 500_000_000);
  });

  test('LTE: "không quá 100 triệu"', () => {
    const f = parseAmountFilter(norm('không quá 100 triệu thì có mấy giao dịch'), pack);
    assertEqual(f?.operator, 'LTE');
    assertEqual(f?.value, 100_000_000);
  });

  test('LTE: "tối đa 2 tỷ"', () => {
    const f = parseAmountFilter(norm('tối đa 2 tỷ cho giao dịch này'), pack);
    assertEqual(f?.operator, 'LTE');
    assertEqual(f?.value, 2_000_000_000);
  });

  test('EQ: "bằng 350 triệu"', () => {
    const f = parseAmountFilter(norm('giao dịch bằng 350 triệu'), pack);
    assertEqual(f?.operator, 'EQ');
    assertEqual(f?.value, 350_000_000);
  });

  test('BETWEEN: "từ 500 triệu đến 2 tỷ"', () => {
    const f = parseAmountFilter(norm('giao dịch từ 500 triệu đến 2 tỷ tuần này'), pack);
    assertEqual(f?.operator, 'BETWEEN');
    assertEqual(f?.min, 500_000_000);
    assertEqual(f?.max, 2_000_000_000);
  });

  test('BETWEEN: "trong khoảng 1 đến 5 tỷ"', () => {
    const f = parseAmountFilter(norm('trong khoảng 1 đến 5 tỷ'), pack);
    assertEqual(f?.operator, 'BETWEEN');
    assertEqual(f?.min, 1_000_000_000);
    assertEqual(f?.max, 5_000_000_000);
  });

  test('unit: "triệu" multiplies by 1,000,000', () => {
    const f = parseAmountFilter(norm('trên 50 triệu'), pack);
    assertEqual(f?.value, 50_000_000);
  });

  test('unit: "nghìn" multiplies by 1,000', () => {
    const f = parseAmountFilter(norm('dưới 500 nghìn'), pack);
    assertEqual(f?.value, 500_000);
  });

  test('unit: bare number with no unit is taken literally', () => {
    const f = parseAmountFilter(norm('bằng 12000000'), pack);
    assertEqual(f?.value, 12_000_000);
  });

  test('currency: defaults to VND when none is mentioned', () => {
    const f = parseAmountFilter(norm('trên 5 tỷ'), pack);
    assertEqual(f?.currency, 'VND');
  });

  test('currency: USD detected when mentioned', () => {
    const f = parseAmountFilter(norm('trên 10000 usd'), pack);
    assertEqual(f?.currency, 'USD');
  });

  test('no operator phrase present -> undefined (never guesses)', () => {
    const f = parseAmountFilter(norm('5 tỷ là số dư của công ty'), pack);
    assertEqual(f, undefined);
  });

  test('no number at all -> undefined', () => {
    const f = parseAmountFilter(norm('có giao dịch nào trên mức bình thường không'), pack);
    assertEqual(f, undefined);
  });

  test('decimal amount: "1,5 tỷ" parses as 1.5 billion', () => {
    const f = parseAmountFilter(norm('trên 1,5 tỷ'), pack);
    assertEqual(f?.value, 1_500_000_000);
  });
});
