import { computeDateRange, resolveDatePeriod, setAnchorDate } from '../src/semantic/date-resolver';
import { assert, assertEqual, describe, test } from './test-runner';
import fs from 'fs';
import path from 'path';

interface DatePeriodDef {
  id: string;
  nameVi: string;
  phrases: string[];
  rule: string;
  offset?: number;
  days?: number;
  months?: number;
  direction?: 'PAST' | 'FUTURE';
}

const periods: DatePeriodDef[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'business-semantics', 'date-periods.json'), 'utf-8'),
);

const ANCHOR = '2026-09-09'; // a Wednesday

describe('date resolution (20 required)', () => {
  test('date-periods.json has all 14 periods', () => {
    assertEqual(periods.length, 14);
  });

  test('TODAY resolves to the anchor date itself', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('hom nay chi bao nhieu', periods);
    assertEqual(r?.periodId, 'TODAY');
    assertEqual(r?.range.from, ANCHOR);
    assertEqual(r?.range.to, ANCHOR);
  });

  test('YESTERDAY resolves to one day before the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('hom qua chi bao nhieu', periods);
    assertEqual(r?.periodId, 'YESTERDAY');
    assertEqual(r?.range.from, '2026-09-08');
  });

  test('THIS_WEEK spans Monday to Sunday containing the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('tuan nay the nao', periods);
    assertEqual(r?.periodId, 'THIS_WEEK');
    assertEqual(r?.range.from, '2026-09-07');
    assertEqual(r?.range.to, '2026-09-13');
  });

  test('LAST_WEEK is the 7 days before THIS_WEEK', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('tuan truoc the nao', periods);
    assertEqual(r?.periodId, 'LAST_WEEK');
    assertEqual(r?.range.from, '2026-08-31');
    assertEqual(r?.range.to, '2026-09-06');
  });

  test('NEXT_WEEK is the 7 days after THIS_WEEK', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('tuan sau co gi khong', periods);
    assertEqual(r?.periodId, 'NEXT_WEEK');
    assertEqual(r?.range.from, '2026-09-14');
  });

  test('THIS_MONTH spans the full calendar month of the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('thang nay chi bao nhieu', periods);
    assertEqual(r?.periodId, 'THIS_MONTH');
    assertEqual(r?.range.from, '2026-09-01');
    assertEqual(r?.range.to, '2026-09-30');
  });

  test('LAST_MONTH spans August when anchor is in September', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('thang truoc the nao', periods);
    assertEqual(r?.periodId, 'LAST_MONTH');
    assertEqual(r?.range.from, '2026-08-01');
    assertEqual(r?.range.to, '2026-08-31');
  });

  test('THIS_QUARTER spans Jul-Sep for a September anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('quy nay the nao', periods);
    assertEqual(r?.periodId, 'THIS_QUARTER');
    assertEqual(r?.range.from, '2026-07-01');
    assertEqual(r?.range.to, '2026-09-30');
  });

  test('LAST_QUARTER spans Apr-Jun for a September anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('quy truoc the nao', periods);
    assertEqual(r?.periodId, 'LAST_QUARTER');
    assertEqual(r?.range.from, '2026-04-01');
    assertEqual(r?.range.to, '2026-06-30');
  });

  test('YEAR_TO_DATE ("từ đầu năm") spans Jan 1 to the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('tu dau nam den gio thu ve bao nhieu', periods);
    assertEqual(r?.periodId, 'YEAR_TO_DATE');
    assertEqual(r?.range.from, '2026-01-01');
    assertEqual(r?.range.to, ANCHOR);
  });

  test('LAST_7_DAYS spans exactly 7 days ending at the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('7 ngay qua the nao', periods);
    assertEqual(r?.periodId, 'LAST_7_DAYS');
    assertEqual(r?.range.from, '2026-09-02');
    assertEqual(r?.range.to, ANCHOR);
  });

  test('LAST_30_DAYS spans 30 days ending at the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('30 ngay qua the nao', periods);
    assertEqual(r?.periodId, 'LAST_30_DAYS');
    assertEqual(r?.range.from, '2026-08-10');
  });

  test('LAST_3_MONTHS spans back from the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('3 thang gan day the nao', periods);
    assertEqual(r?.periodId, 'LAST_3_MONTHS');
    assertEqual(r?.range.to, ANCHOR);
  });

  test('NEXT_7_DAYS spans forward from the anchor', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('7 ngay toi co khoan nao khong', periods);
    assertEqual(r?.periodId, 'NEXT_7_DAYS');
    assertEqual(r?.range.from, ANCHOR);
    assertEqual(r?.range.to, '2026-09-16');
  });

  test('no date phrase present resolves to undefined', () => {
    setAnchorDate(ANCHOR);
    const r = resolveDatePeriod('so du tai khoan hien tai', periods);
    assertEqual(r, undefined);
  });

  test('longest matching phrase wins over a shorter overlapping one', () => {
    setAnchorDate(ANCHOR);
    // "7 ngay qua" (LAST_7_DAYS) should win over any coincidental shorter substring.
    const r = resolveDatePeriod('trong 7 ngay qua co bao nhieu giao dich', periods);
    assertEqual(r?.periodId, 'LAST_7_DAYS');
  });

  test('a resolved range always has from <= to', () => {
    setAnchorDate(ANCHOR);
    for (const p of periods) {
      const range = computeDateRange(p, ANCHOR);
      assert(range.from <= range.to, `${p.id}: from (${range.from}) should be <= to (${range.to})`);
    }
  });

  test('every period phrase list is non-empty', () => {
    for (const p of periods) assert(p.phrases.length > 0, `${p.id} has no phrases`);
  });

  test('anchor date changes are respected by subsequent resolutions', () => {
    setAnchorDate('2026-01-15');
    const r = resolveDatePeriod('hom nay', periods);
    assertEqual(r?.range.from, '2026-01-15');
    setAnchorDate(ANCHOR); // restore for any tests that run after this file
  });

  test('THIS_MONTH correctly handles a year boundary (December anchor)', () => {
    setAnchorDate('2026-12-20');
    const r = resolveDatePeriod('thang nay the nao', periods);
    assertEqual(r?.range.from, '2026-12-01');
    assertEqual(r?.range.to, '2026-12-31');
    setAnchorDate(ANCHOR);
  });
});
