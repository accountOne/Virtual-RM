// Gemini AI Agent — Phase I (deterministic/unit layer, no HTTP). Covers the Zod schema, the
// Tier-2 fallback rule engine (spec §20's "existing rule/static engine" — exercised directly
// here since GEMINI_API_KEY is never configured in this environment, so understand() always
// takes this path), the workflow state machine, the approval gate's revalidation checklist, and
// the mock tool layer including the one genuinely new write path (execute_transfer). HTTP-level
// tests (the 8 required end-to-end cases) are in agent-http.test.ts.

import { assert, assertEqual, describe, test } from './test-runner';
import '../src/agent/agent-mock-tools';
import { approveAndExecute, ApprovalValidationError, cancelWorkflow, validateApproval } from '../src/agent/approval-gate';
import { assertAgentToolAllowed, AgentToolNotAuthorizedError, getAgentTool } from '../src/agent/agent-tool-registry';
import { classifyWithRules } from '../src/agent/fallback-rule-engine';
import { understand } from '../src/agent/gemini-semantic-engine';
import { geminiConfigured } from '../src/agent/gemini-client';
import { REQUIRED_FIELDS_BY_INTENT, semanticUnderstandingSchema } from '../src/agent/schemas/semantic-understanding.schema';
import { AgentWorkflow, createWorkflow, findOpenWorkflowForUser, getWorkflow, InvalidWorkflowTransitionError, transition, _resetWorkflowsForTests } from '../src/agent/workflow-engine';
import { dispatchIntent, Understanding } from '../src/agent/agent-orchestrator';
import { approvalsRepository, bankingCommandsRepository, paymentOrdersRepository, transactionsRepository } from '../src/repositories';
import { _resetAgentConversationsForTests } from '../src/agent/agent-conversation';

const MAKER_CTX = { companyId: 'comp-001', userId: 'msb_mk', role: 'MAKER' as const };
const CHECKER_CTX = { companyId: 'comp-001', userId: 'msb_ck', role: 'CHECKER' as const };

const originalPaymentOrders = paymentOrdersRepository.readAll();
const originalTransactions = transactionsRepository.readAll();
const originalApprovals = approvalsRepository.readAll();

describe('semanticUnderstandingSchema (Zod)', () => {
  test('accepts a well-formed structured-understanding object', () => {
    const parsed = semanticUnderstandingSchema.parse({
      intent: 'create_transfer',
      confidence: 0.96,
      entities: { amount: { value: 5000000, confidence: 0.99, source: 'user_message' } },
      missingFields: [],
      explanation: 'ok',
    });
    assertEqual(parsed.intent, 'create_transfer');
  });

  test('rejects an intent outside the fixed enum — this is what makes prompt injection unable to name an arbitrary tool', () => {
    let threw = false;
    try {
      semanticUnderstandingSchema.parse({ intent: 'delete_all_accounts', confidence: 0.9, entities: {}, missingFields: [], explanation: '' });
    } catch {
      threw = true;
    }
    assert(threw, 'an intent outside AGENT_INTENTS must fail validation');
  });

  test('defaults missing optional fields (entities/missingFields/explanation) rather than throwing', () => {
    const parsed = semanticUnderstandingSchema.parse({ intent: 'check_balance', confidence: 0.5 });
    assertEqual(JSON.stringify(parsed.entities), '{}');
    assertEqual(parsed.missingFields.length, 0);
  });

  test('every entity, when present, must carry value+confidence+source (never a bare value)', () => {
    let threw = false;
    try {
      semanticUnderstandingSchema.parse({ intent: 'check_balance', confidence: 0.5, entities: { amount: 5000000 } });
    } catch {
      threw = true;
    }
    assert(threw, 'a bare entity value (not {value,confidence,source}) must fail validation');
  });
});

describe('fallback-rule-engine — Tier 2 (spec §20), Vietnamese phrasing variations (spec §23)', () => {
  const transferPhrases = [
    'Tôi muốn chuyển 5 triệu cho Nam',
    'Chuyển giúp tôi 5 triệu cho anh Nam',
    'Mình cần chuyển 5.000.000 VND cho Nguyễn Văn A',
    'Thực hiện giao dịch 5 triệu cho Nam',
  ];
  for (const phrase of transferPhrases) {
    test(`"${phrase}" classifies as create_transfer`, () => {
      const r = classifyWithRules(phrase);
      assertEqual(r.intent, 'create_transfer');
    });
  }

  test('an ambiguous "Chuyển tiền cho Nam" (no amount) is create_transfer with a non-empty missingFields', () => {
    const r = classifyWithRules('Chuyển tiền cho Nam');
    assertEqual(r.intent, 'create_transfer');
    assert(r.missingFields.length > 0, 'expected at least one missing required field');
  });

  test('does not mistake a digit run inside a document-style token (e.g. "TX123") for a bare amount', () => {
    const r = classifyWithRules('Kiểm tra giao dịch TX123');
    assertEqual(r.intent, 'track_transaction');
    assertEqual(r.entities.amount, undefined);
  });

  test('a question-shaped message with no rule match becomes general_question, not unknown', () => {
    const r = classifyWithRules('Tỷ giá USD hôm nay thế nào?');
    assertEqual(r.intent, 'general_question');
  });

  test('a very short, unmatched message becomes unknown', () => {
    const r = classifyWithRules('ơ');
    assertEqual(r.intent, 'unknown');
  });

  test('understand() never throws when Gemini is unconfigured — always falls back to rules', async () => {
    assertEqual(geminiConfigured(), false, 'this test environment must have no GEMINI_API_KEY for this assertion to be meaningful');
    const { understanding, source } = await understand({ message: 'Tôi muốn chuyển 2 triệu cho Bình' }, '2026-09-15');
    assertEqual(source, 'fallback_rules');
    assertEqual(understanding.intent, 'create_transfer');
  });
});

describe('workflow-engine — state machine (spec §9)', () => {
  test('legal transitions succeed end to end: UNDERSTANDING -> PLANNING -> WAITING_APPROVAL -> EXECUTING -> COMPLETED', () => {
    const wf = createWorkflow({ userId: 'test-user-a', intent: 'create_transfer', entities: {} });
    assertEqual(wf.status, 'UNDERSTANDING');
    transition(wf.workflowId, 'PLANNING');
    transition(wf.workflowId, 'WAITING_APPROVAL', { toolName: 'execute_transfer', preview: {} });
    transition(wf.workflowId, 'EXECUTING');
    const done = transition(wf.workflowId, 'COMPLETED', { result: { ok: true } });
    assertEqual(done.status, 'COMPLETED');
  });

  test('an illegal transition (e.g. WAITING_APPROVAL -> PLANNING) throws InvalidWorkflowTransitionError', () => {
    const wf = createWorkflow({ userId: 'test-user-b', intent: 'create_transfer', entities: {} });
    transition(wf.workflowId, 'PLANNING');
    transition(wf.workflowId, 'WAITING_APPROVAL', { toolName: 'execute_transfer', preview: {} });
    let threw = false;
    try {
      transition(wf.workflowId, 'PLANNING');
    } catch (e) {
      threw = e instanceof InvalidWorkflowTransitionError;
    }
    assert(threw, 'expected InvalidWorkflowTransitionError');
  });

  test('a second EXECUTING on an already-COMPLETED workflow is rejected — this is the structural half of the double-approve guard', () => {
    const wf = createWorkflow({ userId: 'test-user-c', intent: 'create_transfer', entities: {} });
    transition(wf.workflowId, 'PLANNING');
    transition(wf.workflowId, 'WAITING_APPROVAL', { toolName: 'execute_transfer', preview: {} });
    transition(wf.workflowId, 'EXECUTING');
    transition(wf.workflowId, 'COMPLETED', { result: {} });
    let threw = false;
    try {
      transition(wf.workflowId, 'EXECUTING');
    } catch (e) {
      threw = e instanceof InvalidWorkflowTransitionError;
    }
    assert(threw, 'expected the second EXECUTING attempt to be rejected');
  });

  test('findOpenWorkflowForUser ignores terminal workflows', () => {
    _resetWorkflowsForTests();
    const wf = createWorkflow({ userId: 'test-user-d', intent: 'check_balance', entities: {} });
    transition(wf.workflowId, 'PLANNING');
    transition(wf.workflowId, 'EXECUTING');
    transition(wf.workflowId, 'COMPLETED', { result: {} });
    assertEqual(findOpenWorkflowForUser('test-user-d'), undefined);
  });

  test('a CANCELLED workflow can never be resumed (all outgoing edges are empty)', () => {
    const wf = createWorkflow({ userId: 'test-user-e', intent: 'create_transfer', entities: {} });
    transition(wf.workflowId, 'CANCELLED');
    let threw = false;
    try {
      transition(wf.workflowId, 'PLANNING');
    } catch (e) {
      threw = e instanceof InvalidWorkflowTransitionError;
    }
    assert(threw, 'expected CANCELLED to be terminal');
  });
});

describe('agent-tool-registry — fail-closed whitelist', () => {
  test('every write tool used by the orchestrator is actually registered', () => {
    for (const name of ['create_transfer_draft', 'execute_transfer', 'create_lc_draft', 'submit_lc_mock', 'create_guarantee_draft', 'submit_guarantee_mock', 'create_collection_draft', 'submit_collection_mock']) {
      assert(!!getAgentTool(name), `expected agent tool "${name}" to be registered`);
    }
  });

  test('an unregistered tool name is refused for any role', () => {
    let threw = false;
    try {
      assertAgentToolAllowed('drop_all_tables', 'ADMIN');
    } catch (e) {
      threw = e instanceof AgentToolNotAuthorizedError;
    }
    assert(threw, 'an unregistered agent tool must fail closed');
  });

  test('execute_transfer refuses a CHECKER role', () => {
    let threw = false;
    try {
      assertAgentToolAllowed('execute_transfer', 'CHECKER');
    } catch (e) {
      threw = e instanceof AgentToolNotAuthorizedError;
    }
    assert(threw, 'a Checker must never be allowed to execute a transfer');
  });

  test('every requiresApproval:true tool has riskLevel EXECUTE (never READ/PREPARE)', () => {
    for (const name of ['execute_transfer', 'submit_lc_mock', 'submit_guarantee_mock', 'submit_collection_mock']) {
      const tool = getAgentTool(name)!;
      assertEqual(tool.requiresApproval, true);
      assertEqual(tool.riskLevel, 'EXECUTE');
    }
  });
});

describe('approval-gate — full revalidation checklist (spec §12) + idempotency (spec §13)', () => {
  // Always owned by MAKER_CTX.userId — validateApproval's ownership check compares
  // workflow.userId to the CALLING ctx.userId, so a test helper using a different fake id than
  // the ctx it later validates against would (and, caught live, did) fail with FORBIDDEN before
  // ever reaching the check the test actually means to exercise. workflowId itself is already a
  // fresh UUID per call, so reusing one owner id across these tests creates no collision risk.
  function buildWaitingWorkflow(): AgentWorkflow {
    const wf = createWorkflow({
      userId: MAKER_CTX.userId,
      intent: 'create_transfer',
      entities: { amount: { value: 1000000, confidence: 0.9, source: 'user_message' }, beneficiaryName: { value: 'Test Beneficiary', confidence: 0.9, source: 'user_message' } },
    });
    transition(wf.workflowId, 'PLANNING');
    const draftTool = getAgentTool('create_transfer_draft')!;
    const preview = draftTool.execute(MAKER_CTX, { entities: wf.entities });
    return transition(wf.workflowId, 'WAITING_APPROVAL', { toolName: 'execute_transfer', preview });
  }

  test('a wrong idempotency key is rejected before anything executes', () => {
    const wf = buildWaitingWorkflow();
    let threw = false;
    try {
      validateApproval(wf.workflowId, MAKER_CTX, 'not-the-real-key');
    } catch (e) {
      threw = e instanceof ApprovalValidationError && (e as ApprovalValidationError).code === 'IDEMPOTENCY_MISMATCH';
    }
    assert(threw, 'expected IDEMPOTENCY_MISMATCH');
    assertEqual(getWorkflow(wf.workflowId)!.status, 'WAITING_APPROVAL', 'the workflow must not have moved');
  });

  test('a different user cannot approve someone else\'s workflow', () => {
    const wf = buildWaitingWorkflow();
    let threw = false;
    try {
      validateApproval(wf.workflowId, { ...MAKER_CTX, userId: 'someone-else' }, wf.idempotencyKey);
    } catch (e) {
      threw = e instanceof ApprovalValidationError && (e as ApprovalValidationError).code === 'FORBIDDEN';
    }
    assert(threw, 'expected FORBIDDEN');
  });

  test('a nonexistent workflow id is NOT_FOUND', () => {
    let threw = false;
    try {
      validateApproval('WF-does-not-exist', MAKER_CTX, 'anything');
    } catch (e) {
      threw = e instanceof ApprovalValidationError && (e as ApprovalValidationError).code === 'NOT_FOUND';
    }
    assert(threw, 'expected NOT_FOUND');
  });

  test('a Checker cannot approve a transfer workflow even with the correct key (tool role check runs as part of validation)', () => {
    const wf = createWorkflow({ userId: CHECKER_CTX.userId, intent: 'create_transfer', entities: { amount: { value: 1000000, confidence: 0.9, source: 'user_message' }, beneficiaryName: { value: 'Test', confidence: 0.9, source: 'user_message' } } });
    transition(wf.workflowId, 'PLANNING');
    const preview = getAgentTool('create_transfer_draft')!.execute(MAKER_CTX, { entities: wf.entities });
    transition(wf.workflowId, 'WAITING_APPROVAL', { toolName: 'execute_transfer', preview });
    let threw = false;
    try {
      validateApproval(wf.workflowId, CHECKER_CTX, wf.idempotencyKey);
    } catch (e) {
      threw = e instanceof ApprovalValidationError;
    }
    assert(threw, 'expected the Checker role check to fail validation');
  });

  test('a correct approve executes for real, reaches COMPLETED, and a second approve on the same workflow is rejected (double-approve, spec §13 Test 6)', async () => {
    const wf = buildWaitingWorkflow();
    const before = paymentOrdersRepository.readAll().length;
    const completed = await approveAndExecute(wf.workflowId, MAKER_CTX, wf.idempotencyKey);
    assertEqual(completed.status, 'COMPLETED');
    assertEqual(paymentOrdersRepository.readAll().length, before + 1, 'expected exactly one new payment order');

    let threw = false;
    try {
      await approveAndExecute(wf.workflowId, MAKER_CTX, wf.idempotencyKey);
    } catch (e) {
      threw = e instanceof ApprovalValidationError;
    }
    assert(threw, 'expected the second approve to be rejected');
    assertEqual(paymentOrdersRepository.readAll().length, before + 1, 'expected NO second payment order from the double-approve attempt');
  });

  test('cancelWorkflow reaches CANCELLED and a subsequent approve is rejected', () => {
    const wf = buildWaitingWorkflow();
    const cancelled = cancelWorkflow(wf.workflowId, MAKER_CTX);
    assertEqual(cancelled.status, 'CANCELLED');
    let threw = false;
    try {
      validateApproval(wf.workflowId, MAKER_CTX, wf.idempotencyKey);
    } catch (e) {
      threw = e instanceof ApprovalValidationError && (e as ApprovalValidationError).code === 'WRONG_STATE';
    }
    assert(threw, 'expected WRONG_STATE after cancellation');
  });
});

describe('agent-mock-tools — read tools use real seeded data, execute_transfer writes real records', () => {
  test('get_balance returns a real seeded account', () => {
    const result = getAgentTool('get_balance')!.execute(MAKER_CTX, {});
    assert(!!result, 'expected an account');
  });

  test('search_transaction finds a real seeded transaction by id', () => {
    const result = getAgentTool('search_transaction')!.execute(MAKER_CTX, { transactionId: 'txn-001' }) as { found: boolean };
    assertEqual(result.found, true);
  });

  test('search_transaction reports not-found for an unknown id, without throwing', () => {
    const result = getAgentTool('search_transaction')!.execute(MAKER_CTX, { transactionId: 'does-not-exist' }) as { found: boolean };
    assertEqual(result.found, false);
  });

  test('REQUIRED_FIELDS_BY_INTENT covers every write intent the orchestrator dispatches', () => {
    for (const intent of ['create_transfer', 'create_lc', 'create_guarantee', 'create_collection'] as const) {
      assert(!!REQUIRED_FIELDS_BY_INTENT[intent]?.length, `expected required fields for ${intent}`);
    }
  });

  // Must run last in this describe block (test-runner.ts executes tests in registration order).
  test('cleanup: execute_transfer calls above leave server/data/*.json exactly as they found it', () => {
    paymentOrdersRepository.writeAll(originalPaymentOrders);
    transactionsRepository.writeAll(originalTransactions);
    approvalsRepository.writeAll(originalApprovals);
    assertEqual(paymentOrdersRepository.readAll().length, originalPaymentOrders.length);
    assertEqual(transactionsRepository.readAll().length, originalTransactions.length);
    assertEqual(approvalsRepository.readAll().length, originalApprovals.length);
  });
});

describe('agent-orchestrator — LC/GUARANTEE/COLLECTION also hand off to BankingCommand drafts (Slice 6)', () => {
  const HANDOFF_SESSION = 'test-agent-tradefinance-handoff';
  const originalCommands = bankingCommandsRepository.readAll();
  const security = { companyId: MAKER_CTX.companyId, userId: MAKER_CTX.userId, role: MAKER_CTX.role };

  test('create_lc hands off to a real LC BankingCommand draft with the extracted entities', async () => {
    _resetAgentConversationsForTests();
    const understanding: Understanding = {
      intent: 'create_lc',
      confidence: 0.9,
      entities: {
        lcType: { value: 'SIGHT', confidence: 0.9, source: 'user_message' },
        lcAmount: { value: 25_000, confidence: 0.9, source: 'user_message' },
        lcCurrency: { value: 'USD', confidence: 0.9, source: 'user_message' },
        beneficiary: { value: 'Test Beneficiary Co', confidence: 0.9, source: 'user_message' },
      },
    };
    const response = await dispatchIntent(understanding, MAKER_CTX, security, HANDOFF_SESSION);
    assertEqual(response.status, 'ANSWERED');
    assert(!!response.commandId, 'expected a commandId');
    const command = bankingCommandsRepository.findById(response.commandId!);
    assert(!!command, 'expected the BankingCommand to exist');
    assertEqual(command!.commandType, 'LC');
    assertEqual(command!.status, 'DRAFT');
    assertEqual((command!.formData as { beneficiary: string }).beneficiary, 'Test Beneficiary Co');
    assertEqual((command!.formData as { amount: number }).amount, 25_000);
  });

  test('create_guarantee hands off to a real GUARANTEE BankingCommand draft', async () => {
    _resetAgentConversationsForTests();
    const understanding: Understanding = {
      intent: 'create_guarantee',
      confidence: 0.9,
      entities: {
        guaranteeType: { value: 'BID_BOND', confidence: 0.9, source: 'user_message' },
        guaranteeAmount: { value: 80_000_000, confidence: 0.9, source: 'user_message' },
      },
    };
    const response = await dispatchIntent(understanding, MAKER_CTX, security, HANDOFF_SESSION);
    assert(!!response.commandId, 'expected a commandId');
    const command = bankingCommandsRepository.findById(response.commandId!);
    assertEqual(command!.commandType, 'GUARANTEE');
    assertEqual((command!.formData as { amount: number }).amount, 80_000_000);
  });

  test('create_collection hands off to a real COLLECTION BankingCommand draft', async () => {
    _resetAgentConversationsForTests();
    const understanding: Understanding = {
      intent: 'create_collection',
      confidence: 0.9,
      entities: {
        collectionType: { value: 'DP', confidence: 0.9, source: 'user_message' },
        amount: { value: 12_000, confidence: 0.9, source: 'user_message' },
      },
    };
    const response = await dispatchIntent(understanding, MAKER_CTX, security, HANDOFF_SESSION);
    assert(!!response.commandId, 'expected a commandId');
    const command = bankingCommandsRepository.findById(response.commandId!);
    assertEqual(command!.commandType, 'COLLECTION');
    assertEqual((command!.formData as { amount: number }).amount, 12_000);
  });

  test('cleanup: bankingCommandsRepository restored, workflow store reset', () => {
    bankingCommandsRepository.writeAll(originalCommands);
    _resetWorkflowsForTests();
    _resetAgentConversationsForTests();
    assertEqual(bankingCommandsRepository.readAll().length, originalCommands.length);
  });
});

describe('agent-orchestrator — create_transfer hands off to a BankingCommand draft (Maker/Checker upgrade Slice 5)', () => {
  const HANDOFF_SESSION = 'test-agent-transfer-handoff';
  const originalCommands = bankingCommandsRepository.readAll();

  function fullTransferUnderstanding(): Understanding {
    return {
      intent: 'create_transfer',
      confidence: 0.95,
      entities: {
        amount: { value: 3_300_000, confidence: 0.95, source: 'user_message' },
        beneficiaryName: { value: 'Người Nhận Thử Nghiệm', confidence: 0.9, source: 'user_message' },
        currency: { value: 'VND', confidence: 0.9, source: 'user_message' },
      },
    };
  }

  test('a real BankingCommand DRAFT is created with the Agent-extracted entities, response carries commandId', async () => {
    _resetAgentConversationsForTests();
    const security = { companyId: MAKER_CTX.companyId, userId: MAKER_CTX.userId, role: MAKER_CTX.role };
    const response = await dispatchIntent(fullTransferUnderstanding(), MAKER_CTX, security, HANDOFF_SESSION);

    assertEqual(response.status, 'ANSWERED');
    assertEqual(response.intent, 'create_transfer');
    assert(!!response.commandId, 'expected a commandId in the hand-off response');
    assert(response.message.includes('form'), `expected the message to mention the form, got: ${response.message}`);

    const command = bankingCommandsRepository.findById(response.commandId!);
    assert(!!command, 'expected the BankingCommand to actually exist in storage');
    assertEqual(command!.status, 'DRAFT');
    assertEqual(command!.commandType, 'TRANSFER');
    assertEqual(command!.makerUserId, MAKER_CTX.userId);
    assertEqual((command!.formData as { amount: number }).amount, 3_300_000);
    assertEqual((command!.formData as { beneficiaryName: string }).beneficiaryName, 'Người Nhận Thử Nghiệm');
    assert(!!command!.semanticData, 'expected semanticData to be populated');
    assertEqual(command!.semanticData?.intent, 'create_transfer');
  });

  test('the Agent workflow itself reaches COMPLETED (no WAITING_APPROVAL left for create_transfer)', async () => {
    _resetAgentConversationsForTests();
    const security = { companyId: MAKER_CTX.companyId, userId: MAKER_CTX.userId, role: MAKER_CTX.role };
    const response = await dispatchIntent(fullTransferUnderstanding(), MAKER_CTX, security, HANDOFF_SESSION);
    const workflow = getWorkflow(response.workflowId!);
    assert(!!workflow, 'expected a workflow record');
    assertEqual(workflow!.status, 'COMPLETED');
    assertEqual((workflow!.result as { commandId?: string })?.commandId, response.commandId);
    assertEqual(findOpenWorkflowForUser(HANDOFF_SESSION), undefined, 'a COMPLETED workflow must not still read as "open"');
  });

  test('cleanup: bankingCommandsRepository restored, workflow store reset', () => {
    bankingCommandsRepository.writeAll(originalCommands);
    _resetWorkflowsForTests();
    _resetAgentConversationsForTests();
    assertEqual(bankingCommandsRepository.readAll().length, originalCommands.length);
  });
});

// Must be the LAST thing this file registers (test-runner.ts runs in registration order, and
// this file itself is imported before agent-http.test.ts in run-all.ts). Several negative-path
// tests above deliberately leave a workflow in a non-terminal state (e.g. "a wrong idempotency
// key is rejected" never transitions the workflow away from WAITING_APPROVAL — that's the whole
// point of the assertion) — several of them reuse MAKER_CTX.userId, the SAME real 'msb_mk'
// session agent-http.test.ts's getMakerClient() authenticates as. Without this reset, those
// leaked open workflows made findOpenWorkflowForUser() in agent-http.test.ts's very first
// request return a stale one instead of starting fresh — caught live: check_balance came back
// with intent "create_transfer" and a "please confirm or cancel" message instead of an actual
// balance. The workflow store is otherwise entirely in-memory/global (spec §14's own "in-memory
// is enough for a demo" design), so a full reset here is the correct, simplest fix rather than
// hunting down every individual leaked workflow above.
describe('workflow store isolation', () => {
  test('reset the global workflow store so later test files never see a workflow left open by a negative-path test above', () => {
    _resetWorkflowsForTests();
    assertEqual(findOpenWorkflowForUser(MAKER_CTX.userId), undefined);
  });
});
