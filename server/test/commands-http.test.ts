// Maker/Checker upgrade — Slice 2 HTTP layer, through the REAL Express app (session/CSRF/role
// middleware, same fixtures the rest of the security suite uses). Covers the spec's own 9 test
// scenarios (§19). Must run after security/fixtures (real app + logged-in clients).
//
// Economical on purpose: `transactionRateLimiter` (30 req/min/IP, shared across the WHOLE test
// run — trade-finance/transactions/agent tests already spend some of that budget) gates
// submit/approve/reject. Business-rule coverage for validateCommand() itself already lives in
// commands-domain.test.ts (unit level, no HTTP, no rate limit) — this file only needs enough real
// HTTP calls to prove routing/role-gating/session-derived-identity, so most PENDING_CHECKER setup
// goes through `commandsService` directly (same pattern agent-http.test.ts's own
// `buildWaitingCollectionWorkflow()` established), not a real HTTP submit.

import { assert, assertEqual, describe, test } from './test-runner';
import { getAdminClient, getCheckerClient, getMakerClient } from './security/fixtures';
import { TestClient } from './security/http-client';
import { accountsRepository, auditEventsRepository, bankGuaranteesRepository, bankingCommandsRepository, collectionsRepository, commandSnapshotsRepository, letterOfCreditsRepository, transactionsRepository } from '../src/repositories';
import { commandsService, CommandActor } from '../src/services/commands.service';
import { BankingCommand, CommandType } from '../src/models';

interface CommandBody {
  id: string;
  status: string;
  referenceNo: string;
  idempotencyKey?: string;
  validationResult: { valid: boolean; warnings: { code: string; blocking: boolean }[] };
  executionResult?: { transactionId?: string };
  makerUserId: string;
  rejectReason?: string;
}

const MAKER: CommandActor = { userId: 'msb_mk', displayName: 'Người lập lệnh (Maker)', role: 'MAKER' };
const ADMIN: CommandActor = { userId: 'msb_ad', displayName: 'Quản trị viên (Admin)', role: 'ADMIN' };

const originalAccounts = accountsRepository.readAll();
const originalTransactions = transactionsRepository.readAll();
const originalCommands = bankingCommandsRepository.readAll();
const originalSnapshots = commandSnapshotsRepository.readAll();
const originalAuditEvents = auditEventsRepository.readAll();
const originalLcs = letterOfCreditsRepository.readAll();
const originalGuarantees = bankGuaranteesRepository.readAll();
const originalCollections = collectionsRepository.readAll();

function transferFormData(overrides: Record<string, unknown> = {}) {
  return {
    sourceAccount: 'acc-001',
    beneficiaryName: 'Trần Thị B',
    beneficiaryAccountNumber: '0999888777',
    beneficiaryBankCode: 'VCB',
    amount: 3_000_000,
    currency: 'VND',
    transferPurpose: 'Thanh toán hợp đồng',
    feeBearer: 'SENDER',
    ...overrides,
  };
}

/** Builds a real PENDING_CHECKER command directly via the service — no HTTP, no rate-limit
 * spend — for tests whose point is the Checker-side behavior, not the Maker submit route
 * itself. */
function buildSubmittedCommand(actor: CommandActor, overrides: Record<string, unknown> = {}): BankingCommand {
  const draft = commandsService.createDraft(actor, 'TRANSFER', transferFormData(overrides));
  return commandsService.submit(draft, actor);
}

function buildSubmittedCommandOfType(actor: CommandActor, commandType: CommandType, formData: Record<string, unknown>): BankingCommand {
  const draft = commandsService.createDraft(actor, commandType, formData);
  return commandsService.submit(draft, actor);
}

describe('POST /api/commands — auth + validation', () => {
  test('an anonymous caller gets 401', async () => {
    const res = await new TestClient().post('/api/commands', { commandType: 'TRANSFER', formData: transferFormData() });
    assertEqual(res.status, 401);
  });

  test('a Checker cannot create a command (role gate)', async () => {
    const res = await getCheckerClient().post('/api/commands', { commandType: 'TRANSFER', formData: transferFormData() });
    assertEqual(res.status, 403);
  });

  test('an invalid commandType is rejected with 400', async () => {
    const res = await getMakerClient().post('/api/commands', { commandType: 'NOT_A_TYPE', formData: {} });
    assertEqual(res.status, 400);
  });

  test('missing formData is rejected with 400', async () => {
    const res = await getMakerClient().post('/api/commands', { commandType: 'TRANSFER' });
    assertEqual(res.status, 400);
  });
});

describe('Scenario 1 — Maker creates transfer, full happy path (real HTTP create/validate/submit)', () => {
  test('create draft -> DRAFT with a referenceNo', async () => {
    const res = await getMakerClient().post<CommandBody>('/api/commands', { commandType: 'TRANSFER', formData: transferFormData() });
    assertEqual(res.status, 201);
    assertEqual(res.body.status, 'DRAFT');
    assert(res.body.referenceNo.startsWith('TRF-'), `expected a TRF- reference, got ${res.body.referenceNo}`);
  });

  test('validate -> valid with no warnings for a well-formed transfer', async () => {
    const client = getMakerClient();
    const created = await client.post<CommandBody>('/api/commands', { commandType: 'TRANSFER', formData: transferFormData() });
    const validated = await client.post<CommandBody>(`/api/commands/${created.body.id}/validate`, {});
    assertEqual(validated.body.validationResult.valid, true);
    assertEqual(validated.body.validationResult.warnings.length, 0);
  });

  test('submit (real HTTP) -> PENDING_CHECKER with an idempotencyKey', async () => {
    const client = getMakerClient();
    const created = await client.post<CommandBody>('/api/commands', { commandType: 'TRANSFER', formData: transferFormData() });
    const submitted = await client.post<CommandBody>(`/api/commands/${created.body.id}/submit`, {});
    assertEqual(submitted.status, 200);
    assertEqual(submitted.body.status, 'PENDING_CHECKER');
    assert(!!submitted.body.idempotencyKey, 'expected an idempotencyKey once PENDING_CHECKER');
  });
});

describe('Scenario 2 — Checker views the exact same backend record', () => {
  test('checker queue + detail show the submitted command with matching amount/beneficiary', async () => {
    const submitted = buildSubmittedCommand(MAKER, { beneficiaryName: 'Công ty Kiểm Tra XYZ', amount: 7_500_000 });

    const queueRes = await getCheckerClient().get<CommandBody[]>('/api/checker/commands?status=PENDING_CHECKER');
    assert(!!queueRes.body.find((c) => c.id === submitted.id), 'expected the submitted command to appear in the Checker queue');

    const detailRes = await getCheckerClient().get<{ formData: { beneficiaryName: string; amount: number } }>(`/api/checker/commands/${submitted.id}`);
    assertEqual(detailRes.body.formData.beneficiaryName, 'Công ty Kiểm Tra XYZ');
    assertEqual(detailRes.body.formData.amount, 7_500_000);
  });
});

describe('Scenario 3 — missing beneficiary account blocks submit (real HTTP submit)', () => {
  test('submit fails with 422 when a required field is missing', async () => {
    const client = getMakerClient();
    const created = await client.post<CommandBody>('/api/commands', { commandType: 'TRANSFER', formData: transferFormData({ beneficiaryAccountNumber: '' }) });
    const submitRes = await client.post(`/api/commands/${created.body.id}/submit`, {});
    assertEqual(submitRes.status, 422);
  });
});

describe('Scenario 4 — warning consistency between Maker validate and Checker detail', () => {
  test('the same warning code appears to both Maker (validate) and Checker (detail) for an over-limit amount', async () => {
    const maker = getMakerClient();
    const created = await maker.post<CommandBody>('/api/commands', { commandType: 'TRANSFER', formData: transferFormData({ amount: 600_000_000 }) });
    const validated = await maker.post<CommandBody>(`/api/commands/${created.body.id}/validate`, {});
    assert(!!validated.body.validationResult.warnings.find((w) => w.code === 'TRANSFER_LIMIT_WARNING'), 'expected Maker to see TRANSFER_LIMIT_WARNING');

    // Submit via service directly (already proven over real HTTP in Scenario 1/3) to save
    // transactionRateLimiter budget for the actual point of this test: reading Checker's view.
    const command = commandsService.getById(created.body.id);
    const submitted = commandsService.submit(command, MAKER);

    const detail = await getCheckerClient().get<CommandBody>(`/api/checker/commands/${submitted.id}`);
    assert(!!detail.body.validationResult.warnings.find((w) => w.code === 'TRANSFER_LIMIT_WARNING'), 'expected Checker to see the SAME TRANSFER_LIMIT_WARNING code');
  });
});

describe('Scenario 5 — Checker rejects with a reason', () => {
  test('reject without a reason is 400', async () => {
    const submitted = buildSubmittedCommand(MAKER);
    const res = await getCheckerClient().post(`/api/checker/commands/${submitted.id}/reject`, {});
    assertEqual(res.status, 400);
  });

  test('reject with a reason -> REJECTED, reason persisted', async () => {
    const submitted = buildSubmittedCommand(MAKER);
    const res = await getCheckerClient().post<CommandBody>(`/api/checker/commands/${submitted.id}/reject`, { reason: 'Thông tin người nhận chưa chính xác' });
    assertEqual(res.status, 200);
    assertEqual(res.body.status, 'REJECTED');
    assertEqual(res.body.rejectReason, 'Thông tin người nhận chưa chính xác');
  });
});

describe('Scenario 6 — Checker approves: real execution, real audit', () => {
  test('approve -> APPROVED with a real transactionId, account balance decreases', async () => {
    const submitted = buildSubmittedCommand(MAKER, { amount: 1_234_000 });
    const before = accountsRepository.findById('acc-001')!;

    const approveRes = await getCheckerClient().post<CommandBody>(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assertEqual(approveRes.status, 200);
    assertEqual(approveRes.body.status, 'APPROVED');
    assert(!!approveRes.body.executionResult?.transactionId, 'expected a real transactionId in executionResult');
    assert(!!transactionsRepository.findById(approveRes.body.executionResult!.transactionId!), 'expected the executed Transaction to actually exist in transactions.json');

    const after = accountsRepository.findById('acc-001')!;
    assertEqual(after.availableBalance, before.availableBalance - 1_234_000);
  });

  test('audit trail records the full lifecycle, visible to both Maker and Checker', async () => {
    const submitted = buildSubmittedCommand(MAKER, { amount: 222_000 });
    await getCheckerClient().get(`/api/checker/commands/${submitted.id}`); // records VIEWED_BY_CHECKER
    await getCheckerClient().post(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });

    const checkerView = await getCheckerClient().get<{ eventType: string }[]>(`/api/checker/commands/${submitted.id}/audit-events`);
    const eventTypes = checkerView.body.map((e) => e.eventType);
    for (const expected of ['DRAFT_CREATED', 'SUBMITTED', 'VIEWED_BY_CHECKER', 'APPROVED', 'EXECUTED']) {
      assert(eventTypes.includes(expected), `expected ${expected} in audit trail, got ${JSON.stringify(eventTypes)}`);
    }

    const makerView = await getMakerClient().get<{ eventType: string }[]>(`/api/commands/${submitted.id}/audit-events`);
    assertEqual(makerView.body.length, checkerView.body.length, 'Maker and Checker must see the same audit trail');
  });
});

describe('Scenario 7 — double approve is rejected, no duplicate execution', () => {
  test('a second approve with the same idempotencyKey fails, only one transaction is created', async () => {
    const submitted = buildSubmittedCommand(MAKER, { amount: 555_000 });
    const client = getCheckerClient();
    const first = await client.post<CommandBody>(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assertEqual(first.status, 200);
    const before = transactionsRepository.readAll().length;

    const second = await client.post(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assert(second.status >= 400, `expected the second approve to fail, got ${second.status}`);
    assertEqual(transactionsRepository.readAll().length, before, 'no duplicate transaction from the double-approve attempt');
  });

  test('a wrong idempotencyKey is rejected with 409', async () => {
    const submitted = buildSubmittedCommand(MAKER);
    const res = await getCheckerClient().post(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: 'not-the-real-key' });
    assertEqual(res.status, 409);
  });
});

describe('Scenario 8 — cannot approve/reject own command', () => {
  test('an ADMIN who created and submitted a command cannot approve it themselves', async () => {
    const submitted = buildSubmittedCommand(ADMIN, { amount: 111_000 });
    const res = await getAdminClient().post(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assertEqual(res.status, 403);
  });

  test('an ADMIN who created and submitted a command cannot reject it themselves', async () => {
    const submitted = buildSubmittedCommand(ADMIN, { amount: 112_000 });
    const res = await getAdminClient().post(`/api/checker/commands/${submitted.id}/reject`, { reason: 'test' });
    assertEqual(res.status, 403);
  });
});

describe('Scenario 9 — Checker cannot edit form data', () => {
  test('PUT /api/commands/:id as Checker is blocked by the role gate', async () => {
    const submitted = buildSubmittedCommand(MAKER);
    const res = await getCheckerClient().put(`/api/commands/${submitted.id}`, { formData: {} });
    assertEqual(res.status, 403);
  });
});

describe('Slice 6 — LC/Guarantee/Collection now have a real approve path (audit gap #2)', () => {
  test('LC: approve creates a real LetterOfCredit via the existing trade-finance.service.ts', async () => {
    const submitted = buildSubmittedCommandOfType(MAKER, 'LC', {
      type: 'IMPORT',
      subType: 'SIGHT',
      beneficiary: 'Global Trading Co',
      currency: 'USD',
      amount: 40_000,
      latestShipmentDate: '2026-11-01',
      expiryDate: '2026-11-30',
      requiredDocuments: ['COMMERCIAL_INVOICE'],
    });
    const before = letterOfCreditsRepository.readAll().length;
    const res = await getCheckerClient().post<CommandBody & { executionResult?: { lcNumber?: string } }>(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assertEqual(res.status, 200);
    assertEqual(res.body.status, 'APPROVED');
    assert(!!res.body.executionResult?.lcNumber, 'expected a real lcNumber in executionResult');
    assertEqual(letterOfCreditsRepository.readAll().length, before + 1);
  });

  test('LC: reject leaves no LetterOfCredit created', async () => {
    const submitted = buildSubmittedCommandOfType(MAKER, 'LC', {
      type: 'EXPORT',
      subType: 'SIGHT',
      beneficiary: 'Another Co',
      currency: 'USD',
      amount: 10_000,
      latestShipmentDate: '2026-11-01',
      expiryDate: '2026-11-30',
    });
    const before = letterOfCreditsRepository.readAll().length;
    const res = await getCheckerClient().post(`/api/checker/commands/${submitted.id}/reject`, { reason: 'Thiếu chứng từ' });
    assertEqual(res.status, 200);
    assertEqual(letterOfCreditsRepository.readAll().length, before);
  });

  test('GUARANTEE: approve creates a real BankGuarantee', async () => {
    const submitted = buildSubmittedCommandOfType(MAKER, 'GUARANTEE', {
      type: 'PERFORMANCE_BOND',
      beneficiary: 'Global Trading Co',
      currency: 'VND',
      amount: 50_000_000,
      expiryDate: '2026-12-31',
    });
    const before = bankGuaranteesRepository.readAll().length;
    const res = await getCheckerClient().post<CommandBody & { executionResult?: { bgNumber?: string } }>(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assertEqual(res.status, 200);
    assert(!!res.body.executionResult?.bgNumber, 'expected a real bgNumber in executionResult');
    assertEqual(bankGuaranteesRepository.readAll().length, before + 1);
  });

  test('COLLECTION: approve creates a real Collection', async () => {
    const submitted = buildSubmittedCommandOfType(MAKER, 'COLLECTION', {
      type: 'EXPORT',
      subType: 'DP',
      direction: 'OUTWARD',
      drawer: 'ABC Manufacturing JSC',
      drawee: 'Global Trading Co',
      currency: 'USD',
      amount: 15_000,
      dueDate: '2027-01-15',
    });
    const before = collectionsRepository.readAll().length;
    const res = await getCheckerClient().post<CommandBody & { executionResult?: { collectionNumber?: string } }>(`/api/checker/commands/${submitted.id}/approve`, { idempotencyKey: submitted.idempotencyKey });
    assertEqual(res.status, 200);
    assert(!!res.body.executionResult?.collectionNumber, 'expected a real collectionNumber in executionResult');
    assertEqual(collectionsRepository.readAll().length, before + 1);
  });

  test('a Checker still cannot CREATE an LC command (role gate unchanged)', async () => {
    const res = await getCheckerClient().post('/api/commands', { commandType: 'LC', formData: {} });
    assertEqual(res.status, 403);
  });
});

describe("Ownership — a Maker cannot see or act on another user's draft", () => {
  test('a non-owner Maker gets 404 on GET /api/commands/:id (not leaked as 403)', async () => {
    // Only one MAKER demo user exists — use the ADMIN-created draft (a genuinely different
    // makerUserId) the same way agent-http.test.ts's own ownership test does.
    const draft = commandsService.createDraft(ADMIN, 'TRANSFER', transferFormData());
    const makerRes = await getMakerClient().get(`/api/commands/${draft.id}`);
    assertEqual(makerRes.status, 404);
  });
});

describe('GET /api/activity-history — Lịch sử hoạt động (UI redesign, Phase 4)', () => {
  test('a Maker only sees events for commands they own', async () => {
    const own = buildSubmittedCommand(MAKER, { amount: 113_000 });
    const other = commandsService.createDraft(ADMIN, 'TRANSFER', transferFormData());
    const res = await getMakerClient().get<{ commandId: string }[]>('/api/activity-history');
    assertEqual(res.status, 200);
    assert(res.body.some((e) => e.commandId === own.id), 'expected the Maker\'s own command to appear');
    assert(!res.body.some((e) => e.commandId === other.id), "expected another user's draft to be excluded");
  });

  test('a Checker sees events across every command (same visibility as the unfiltered queue)', async () => {
    const own = buildSubmittedCommand(MAKER, { amount: 114_000 });
    const res = await getCheckerClient().get<{ commandId: string }[]>('/api/activity-history');
    assertEqual(res.status, 200);
    assert(res.body.some((e) => e.commandId === own.id), "expected the Checker to see the Maker's command too");
  });

  test('newest events come first', async () => {
    const first = buildSubmittedCommand(MAKER, { amount: 115_000 });
    const second = buildSubmittedCommand(MAKER, { amount: 116_000 });
    const res = await getMakerClient().get<{ commandId: string; createdAt: string }[]>('/api/activity-history');
    const firstIdx = res.body.findIndex((e) => e.commandId === first.id);
    const secondIdx = res.body.findIndex((e) => e.commandId === second.id);
    assert(secondIdx < firstIdx, 'expected the more recently created command\'s events to sort earlier (newest first)');
  });
});

describe('Maker/Checker upgrade — cleanup', () => {
  test('cleanup: every write this file made is reverted', () => {
    accountsRepository.writeAll(originalAccounts);
    transactionsRepository.writeAll(originalTransactions);
    bankingCommandsRepository.writeAll(originalCommands);
    commandSnapshotsRepository.writeAll(originalSnapshots);
    auditEventsRepository.writeAll(originalAuditEvents);
    letterOfCreditsRepository.writeAll(originalLcs);
    bankGuaranteesRepository.writeAll(originalGuarantees);
    collectionsRepository.writeAll(originalCollections);
    assertEqual(accountsRepository.readAll().length, originalAccounts.length);
    assertEqual(transactionsRepository.readAll().length, originalTransactions.length);
    assertEqual(bankingCommandsRepository.readAll().length, originalCommands.length);
  });
});
