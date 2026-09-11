import { describe, test, assert, assertEqual } from './test-runner';
import { canCreateLc, tradeFinanceService } from '../src/services/trade-finance.service';
import { bankGuaranteesRepository, collectionsRepository, letterOfCreditsRepository } from '../src/repositories';

// createLc/createGuarantee/createCollection persist to server/data/*.json (the same
// mutable store the Admin Demo Data / Reset flow manages) — snapshotted here and restored
// in the final test so running this suite repeatedly never grows those files.
const originalLcs = letterOfCreditsRepository.readAll();
const originalGuarantees = bankGuaranteesRepository.readAll();
const originalCollections = collectionsRepository.readAll();

describe('Trade Finance dedicated-screens REST API (Phase 7)', () => {
  test('listLc returns real seeded LCs', () => {
    const items = tradeFinanceService.listLc();
    assert(items.length > 0, 'expected at least one LC');
  });

  test('getLc finds by lcNumber, undefined when not found', () => {
    const found = tradeFinanceService.getLc('LC-2026-001');
    assertEqual(found?.lcNumber, 'LC-2026-001');
    assertEqual(tradeFinanceService.getLc('NOPE'), undefined);
  });

  test('createLc returns a real PENDING_APPROVAL record with a fresh lcNumber', () => {
    const before = tradeFinanceService.listLc().length;
    const created = tradeFinanceService.createLc({
      type: 'IMPORT',
      subType: 'SIGHT',
      beneficiary: 'Test Beneficiary Co.',
      currency: 'USD',
      amount: 10_000,
      latestShipmentDate: '2027-01-01',
      expiryDate: '2027-02-01',
      requiredDocuments: ['COMMERCIAL_INVOICE'],
    });
    assertEqual(created.status, 'PENDING_APPROVAL');
    assertEqual(created.outstandingAmount, 0);
    assertEqual(created.documents.length, 1);
    assertEqual(created.documents[0].status, 'MISSING');
    assert(tradeFinanceService.listLc().length === before + 1, 'expected the new LC to be persisted');
    assertEqual(tradeFinanceService.getLc(created.lcNumber)?.lcNumber, created.lcNumber);
  });

  test('listGuarantees returns real seeded guarantees including a PENDING_APPROVAL one', () => {
    const items = tradeFinanceService.listGuarantees();
    assert(items.some((g) => g.status === 'PENDING_APPROVAL'), 'expected at least one PENDING_APPROVAL guarantee');
  });

  test('getGuarantee finds by bgNumber', () => {
    assertEqual(tradeFinanceService.getGuarantee('BG-2026-013')?.status, 'CLAIMED');
  });

  test('createGuarantee returns a real PENDING_APPROVAL record', () => {
    const created = tradeFinanceService.createGuarantee({
      type: 'BID_BOND',
      beneficiary: 'Test Beneficiary Co.',
      currency: 'VND',
      amount: 100_000_000,
      expiryDate: '2027-03-01',
    });
    assertEqual(created.status, 'PENDING_APPROVAL');
    assertEqual(created.claims.length, 0);
  });

  test('listCollections / getCollection / createCollection', () => {
    assert(tradeFinanceService.listCollections().length > 0, 'expected at least one collection');
    assertEqual(tradeFinanceService.getCollection('COL-2026-020')?.status, 'OVERDUE');
    const created = tradeFinanceService.createCollection({
      type: 'EXPORT',
      subType: 'DP',
      direction: 'OUTWARD',
      drawer: 'ABC Manufacturing JSC',
      drawee: 'Test Drawee Co.',
      currency: 'USD',
      amount: 5_000,
      dueDate: '2027-01-15',
    });
    assertEqual(created.status, 'PROCESSING');
    assertEqual(created.counterparty, 'Test Drawee Co.');
  });

  test('summary reports real, non-negative counts and a per-currency exposure total', () => {
    const s = tradeFinanceService.summary();
    assert(s.lc.active >= 0 && s.guarantee.active >= 0 && s.collection.active >= 0, 'counts must be non-negative');
    assert(s.exposure.total.length > 0, 'expected at least one currency in total exposure');
    assert(s.risk.highPriority >= 0, 'risk.highPriority must be non-negative');
  });

  // Phase 5.5 BRD alignment §14/§26 — LC issuance is Maker-initiated; a Checker must never be
  // able to create one, enforced server-side (server/src/controllers/trade-finance.controller.ts).
  test('canCreateLc denies a Checker', () => assertEqual(canCreateLc('CHECKER'), false));
  test('canCreateLc allows a Maker', () => assertEqual(canCreateLc('MAKER'), true));
  test('canCreateLc allows an Admin', () => assertEqual(canCreateLc('ADMIN'), true));
  test('canCreateLc allows an unspecified role (demo has no universal auth requirement beyond this)', () => assertEqual(canCreateLc(undefined), true));

  // Must run last (test-runner.ts executes tests in registration order within a suite).
  test('cleanup: create* calls above leave server/data/*.json exactly as they found it', () => {
    letterOfCreditsRepository.writeAll(originalLcs);
    bankGuaranteesRepository.writeAll(originalGuarantees);
    collectionsRepository.writeAll(originalCollections);
    assertEqual(letterOfCreditsRepository.readAll().length, originalLcs.length);
    assertEqual(bankGuaranteesRepository.readAll().length, originalGuarantees.length);
    assertEqual(collectionsRepository.readAll().length, originalCollections.length);
  });
});
