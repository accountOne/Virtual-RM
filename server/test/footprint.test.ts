// Phase 5.5 BRD alignment — Dấu ấn (Footprint), see docs/phase-5.5-footprint.md.

import { describe, test, assert, assertEqual } from './test-runner';
import { getAnchorDates } from '../src/services/transactions.service';
import { buildFootprint } from '../src/services/footprint.service';
import footprintRanking from '../src/config/footprint-ranking.json';

const anchorToday = getAnchorDates().today;

describe('Footprint — Dấu ấn cá nhân/doanh nghiệp', () => {
  test('business footprint has a non-empty rank, since-label, and stats', () => {
    const f = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    assertEqual(f.scope, 'business');
    assert(f.rankLabel.length > 0, 'expected a non-empty rankLabel');
    assert(f.sinceLabel.includes('2024-03-15'), 'expected sinceLabel to reference the real registeredAt from customer.json');
    assert(f.stats.length > 0, 'expected at least one stat');
    assert(f.wishMessage.length > 0, 'expected a non-empty wishMessage');
  });

  test('business footprint name is the real company name from customer.json', () => {
    const f = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    assertEqual(f.name, 'ABC Manufacturing JSC');
  });

  test('business footprint totalIncoming/totalOutgoing stats are computed from real transactions.json, not hardcoded', () => {
    const f = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    const totalTxns = f.stats.find((s) => s.label === 'Tổng số giao dịch');
    assert(!!totalTxns, 'expected a "Tổng số giao dịch" stat');
    assert(Number(totalTxns!.value) > 0, 'expected a positive transaction count from real seeded data');
  });

  test('business footprint topPartners.received/sent are populated from real transaction counterparties', () => {
    const f = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    assert(!!f.topPartners, 'expected topPartners for business scope');
    assert(f.topPartners!.received.length > 0, 'expected at least one top received-from partner');
    assert(f.topPartners!.sent.length > 0, 'expected at least one top sent-to partner');
  });

  test('personal footprint name matches the requested userId', () => {
    const f = buildFootprint('personal', 'msb_mk', anchorToday, 'year');
    assertEqual(f.name, 'msb_mk');
    assertEqual(f.scope, 'personal');
  });

  test('personal footprint createdCount reflects this user\'s real payment orders (msb_mk initiated 6 in payment-orders.json)', () => {
    const f = buildFootprint('personal', 'msb_mk', anchorToday, 'year');
    const created = f.stats.find((s) => s.label === 'Lệnh đã tạo');
    assertEqual(created?.value, '6');
  });

  test('personal footprint for a user with no payment orders still returns a valid (zeroed) result, not a crash', () => {
    const f = buildFootprint('personal', 'msb_ad', anchorToday, 'year');
    const created = f.stats.find((s) => s.label === 'Lệnh đã tạo');
    assertEqual(created?.value, '0');
  });

  test('rank label differs meaningfully between a highly-active and a less-active personal footprint', () => {
    const active = buildFootprint('personal', 'msb_mk', anchorToday, 'year');
    const quiet = buildFootprint('personal', 'msb_ad', anchorToday, 'year');
    assert(active.rankLabel !== quiet.rankLabel || active.rankMessage !== quiet.rankMessage, 'expected differing engagement levels to produce a differing rank/message');
  });

  test('is deterministic — two calls with the same input give an identical result', () => {
    const a = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    const b = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    assertEqual(JSON.stringify(a), JSON.stringify(b));
  });

  test('a shorter period (month) never reports more transactions than a longer one (year)', () => {
    const month = buildFootprint('business', 'msb_mk', anchorToday, 'month');
    const year = buildFootprint('business', 'msb_mk', anchorToday, 'year');
    const monthCount = Number(month.stats.find((s) => s.label === 'Tổng số giao dịch')!.value);
    const yearCount = Number(year.stats.find((s) => s.label === 'Tổng số giao dịch')!.value);
    assert(monthCount <= yearCount, `expected month (${monthCount}) <= year (${yearCount}) transaction count`);
  });

  test('every rank tier config entry has a non-empty label and message', () => {
    for (const scope of ['business', 'personal'] as const) {
      for (const tier of footprintRanking[scope].tiers) {
        assert(!!tier.label, `${scope} tier missing label`);
        assert(!!tier.message, `${scope} tier missing message`);
      }
    }
  });
});
