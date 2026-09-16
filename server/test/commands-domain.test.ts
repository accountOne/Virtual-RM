// Maker/Checker upgrade — Slice 1 (domain/storage/validation-engine only, no HTTP yet).
// See docs/MAKER_CHECKER_AUDIT.md for the audit this slice implements.

import { assert, assertEqual, describe, test } from './test-runner';
import { validateCommand, isCommandTypeSupported, UnsupportedCommandTypeError } from '../src/domain/rules/validation-engine';
import { BENEFICIARY_BANKS, isKnownBeneficiaryBank } from '../src/domain/reference-data/beneficiary-banks';
import { bankingCommandsRepository, commandSnapshotsRepository, auditEventsRepository } from '../src/repositories';
import { BankingCommand } from '../src/models';

const MAKER_ID = 'msb_mk';

function validTransferForm(overrides: Record<string, unknown> = {}) {
  return {
    sourceAccount: 'acc-001',
    beneficiaryName: 'Nguyễn Văn A',
    beneficiaryAccountNumber: '0123456789',
    beneficiaryBankCode: 'VCB',
    amount: 5_000_000,
    currency: 'VND',
    transferPurpose: 'Thanh toán dịch vụ',
    feeBearer: 'SENDER',
    ...overrides,
  };
}

describe('reference-data/beneficiary-banks', () => {
  test('has at least the 7 banks required by spec §6.2', () => {
    assert(BENEFICIARY_BANKS.length >= 7, `expected at least 7 banks, got ${BENEFICIARY_BANKS.length}`);
  });
  test('isKnownBeneficiaryBank rejects a free-typed bank name', () => {
    assertEqual(isKnownBeneficiaryBank('Ngân hàng ABC tự bịa'), false);
  });
  test('isKnownBeneficiaryBank accepts a real code', () => {
    assertEqual(isKnownBeneficiaryBank('MSB'), true);
  });
});

describe('validation-engine — commandType gating', () => {
  test('all 4 command types are supported (Slice 6 wired LC/GUARANTEE/COLLECTION)', () => {
    for (const type of ['TRANSFER', 'LC', 'GUARANTEE', 'COLLECTION'] as const) {
      assertEqual(isCommandTypeSupported(type), true);
    }
  });
  test('an unknown commandType still throws rather than silently passing', () => {
    let threw = false;
    try {
      validateCommand('NOT_A_TYPE' as never, {}, { actorUserId: MAKER_ID, existingCommands: [] });
    } catch (e) {
      threw = e instanceof UnsupportedCommandTypeError;
    }
    assert(threw, 'expected UnsupportedCommandTypeError for an unknown type');
  });
});

describe('validation-engine — TRANSFER', () => {
  test('a fully valid transfer form passes with no warnings', () => {
    const result = validateCommand('TRANSFER', validTransferForm(), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, true);
    assertEqual(result.errors.length, 0);
    assertEqual(result.warnings.length, 0);
  });

  test('missing amount is a schema ValidationError, not a Warning (spec §5.2 separation)', () => {
    const form = validTransferForm();
    delete (form as Record<string, unknown>).amount;
    const result = validateCommand('TRANSFER', form, { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, false);
    assert(result.errors.some((e) => e.field === 'amount'), `expected an amount error, got ${JSON.stringify(result.errors)}`);
  });

  test('missing beneficiaryAccountNumber is rejected by schema', () => {
    const form = validTransferForm({ beneficiaryAccountNumber: '' });
    const result = validateCommand('TRANSFER', form, { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, false);
    assert(result.errors.some((e) => e.field === 'beneficiaryAccountNumber'));
  });

  test('an unknown bank code raises a BLOCKING BENEFICIARY_BANK_REQUIRED warning', () => {
    const result = validateCommand('TRANSFER', validTransferForm({ beneficiaryBankCode: 'NOT-A-REAL-BANK' }), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, false);
    const w = result.warnings.find((w) => w.code === 'BENEFICIARY_BANK_REQUIRED');
    assert(!!w && w.blocking, 'expected a blocking BENEFICIARY_BANK_REQUIRED warning');
  });

  test('an amount over the real mock available balance raises a BLOCKING INSUFFICIENT_MOCK_BALANCE warning', () => {
    // acc-001 (VND) availableBalance is 11,850,000,000 — comfortably under this.
    const result = validateCommand('TRANSFER', validTransferForm({ amount: 999_000_000_000 }), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, false);
    const w = result.warnings.find((w) => w.code === 'INSUFFICIENT_MOCK_BALANCE');
    assert(!!w && w.blocking, 'expected a blocking INSUFFICIENT_MOCK_BALANCE warning');
  });

  test('an amount over the mock single-transfer VND limit raises a non-blocking TRANSFER_LIMIT_WARNING, still valid', () => {
    const result = validateCommand('TRANSFER', validTransferForm({ amount: 600_000_000 }), { actorUserId: MAKER_ID, existingCommands: [] });
    const w = result.warnings.find((w) => w.code === 'TRANSFER_LIMIT_WARNING');
    assert(!!w && !w.blocking, 'expected a non-blocking TRANSFER_LIMIT_WARNING');
    assertEqual(result.valid, true, 'a non-blocking warning must not flip valid to false');
  });

  test('a second identical transfer within the duplicate window raises DUPLICATE_TRANSACTION_WARNING', () => {
    const form = validTransferForm();
    const existing: BankingCommand = {
      id: 'cmd-test-dup',
      commandType: 'TRANSFER',
      referenceNo: 'TRF-TEST-DUP',
      makerUserId: MAKER_ID,
      makerName: 'Test Maker',
      status: 'PENDING_CHECKER',
      formData: form,
      validationResult: { valid: true, errors: [], warnings: [], checkedAt: new Date().toISOString() },
      warnings: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = validateCommand('TRANSFER', form, { actorUserId: MAKER_ID, existingCommands: [existing] });
    const w = result.warnings.find((w) => w.code === 'DUPLICATE_TRANSACTION_WARNING');
    assert(!!w && !w.blocking, 'expected a non-blocking DUPLICATE_TRANSACTION_WARNING');
  });

  test('the same duplicate form from a DIFFERENT maker does not trigger the duplicate warning', () => {
    const form = validTransferForm();
    const existing: BankingCommand = {
      id: 'cmd-test-dup-2',
      commandType: 'TRANSFER',
      referenceNo: 'TRF-TEST-DUP-2',
      makerUserId: 'someone-else',
      makerName: 'Other Maker',
      status: 'PENDING_CHECKER',
      formData: form,
      validationResult: { valid: true, errors: [], warnings: [], checkedAt: new Date().toISOString() },
      warnings: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = validateCommand('TRANSFER', form, { actorUserId: MAKER_ID, existingCommands: [existing] });
    assert(!result.warnings.some((w) => w.code === 'DUPLICATE_TRANSACTION_WARNING'), 'must not flag duplicate across different makers');
  });
});

function validLcForm(overrides: Record<string, unknown> = {}) {
  return {
    type: 'IMPORT',
    subType: 'SIGHT',
    beneficiary: 'Global Trading Co',
    currency: 'USD',
    amount: 50_000,
    latestShipmentDate: '2026-11-01',
    expiryDate: '2026-11-30',
    requiredDocuments: ['COMMERCIAL_INVOICE'],
    ...overrides,
  };
}

describe('validation-engine — LC (Slice 6)', () => {
  test('a fully valid LC form passes with no warnings', () => {
    const result = validateCommand('LC', validLcForm(), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, true);
    assertEqual(result.warnings.length, 0);
  });

  test('missing beneficiary is a schema ValidationError', () => {
    const result = validateCommand('LC', validLcForm({ beneficiary: '' }), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, false);
    assert(result.errors.some((e) => e.field === 'beneficiary'));
  });

  test('expiryDate before latestShipmentDate raises a BLOCKING warning', () => {
    const result = validateCommand('LC', validLcForm({ latestShipmentDate: '2026-12-01', expiryDate: '2026-11-01' }), { actorUserId: MAKER_ID, existingCommands: [] });
    const w = result.warnings.find((w) => w.code === 'LC_EXPIRY_BEFORE_SHIPMENT');
    assert(!!w && w.blocking);
    assertEqual(result.valid, false);
  });

  test('no required documents raises a non-blocking warning', () => {
    const result = validateCommand('LC', validLcForm({ requiredDocuments: [] }), { actorUserId: MAKER_ID, existingCommands: [] });
    const w = result.warnings.find((w) => w.code === 'LC_NO_REQUIRED_DOCUMENTS');
    assert(!!w && !w.blocking);
    assertEqual(result.valid, true);
  });
});

function validGuaranteeForm(overrides: Record<string, unknown> = {}) {
  return {
    type: 'PERFORMANCE_BOND',
    beneficiary: 'Global Trading Co',
    currency: 'VND',
    amount: 100_000_000,
    expiryDate: '2026-12-31',
    ...overrides,
  };
}

describe('validation-engine — GUARANTEE (Slice 6)', () => {
  test('a fully valid guarantee form passes', () => {
    const result = validateCommand('GUARANTEE', validGuaranteeForm(), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, true);
  });

  test('amount over the available TRADE_FINANCE limit raises a non-blocking warning', () => {
    const result = validateCommand('GUARANTEE', validGuaranteeForm({ amount: 999_000_000_000 }), { actorUserId: MAKER_ID, existingCommands: [] });
    const w = result.warnings.find((w) => w.code === 'GUARANTEE_LIMIT_WARNING');
    assert(!!w && !w.blocking, 'expected a non-blocking GUARANTEE_LIMIT_WARNING');
    assertEqual(result.valid, true);
  });
});

function validCollectionForm(overrides: Record<string, unknown> = {}) {
  return {
    type: 'EXPORT',
    subType: 'DP',
    direction: 'OUTWARD',
    drawer: 'ABC Manufacturing JSC',
    drawee: 'Global Trading Co',
    currency: 'USD',
    amount: 20_000,
    dueDate: '2027-01-15',
    ...overrides,
  };
}

describe('validation-engine — COLLECTION (Slice 6)', () => {
  test('a fully valid collection form passes', () => {
    const result = validateCommand('COLLECTION', validCollectionForm(), { actorUserId: MAKER_ID, existingCommands: [] });
    assertEqual(result.valid, true);
  });

  test('a due date in the past raises a non-blocking warning', () => {
    const result = validateCommand('COLLECTION', validCollectionForm({ dueDate: '2020-01-01' }), { actorUserId: MAKER_ID, existingCommands: [] });
    const w = result.warnings.find((w) => w.code === 'COLLECTION_DUE_DATE_PAST');
    assert(!!w && !w.blocking);
    assertEqual(result.valid, true);
  });
});

describe('commands repositories — wired via existing JsonFileRepository', () => {
  const originalCommands = bankingCommandsRepository.readAll();
  const originalSnapshots = commandSnapshotsRepository.readAll();
  const originalAuditEvents = auditEventsRepository.readAll();

  test('bankingCommandsRepository round-trips a record', () => {
    const record: BankingCommand = {
      id: 'cmd-roundtrip-test',
      commandType: 'TRANSFER',
      referenceNo: 'TRF-ROUNDTRIP',
      makerUserId: MAKER_ID,
      makerName: 'Test Maker',
      status: 'DRAFT',
      formData: validTransferForm(),
      validationResult: { valid: true, errors: [], warnings: [], checkedAt: new Date().toISOString() },
      warnings: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    bankingCommandsRepository.writeAll([...originalCommands, record]);
    const found = bankingCommandsRepository.findById('cmd-roundtrip-test');
    assert(!!found, 'expected the record to round-trip');
    assertEqual(found!.referenceNo, 'TRF-ROUNDTRIP');
  });

  test('cleanup: repositories restored to original state', () => {
    bankingCommandsRepository.writeAll(originalCommands);
    commandSnapshotsRepository.writeAll(originalSnapshots);
    auditEventsRepository.writeAll(originalAuditEvents);
    assertEqual(bankingCommandsRepository.readAll().length, originalCommands.length);
  });
});
