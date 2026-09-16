// Agent Orchestrator — the single place that decides what happens next (spec §0's own split:
// "LLM = Understanding + Reasoning, Agent = Decision + Workflow orchestration"). Gemini never
// calls a tool and never sets a workflow status; every branch below is plain, auditable
// TypeScript control flow, not a model decision.

import { toUserContext, UserContext } from '../ai/types';
import { findUser } from '../auth/user-store';
import { CommandType } from '../models';
import { answerQuery } from '../semantic/semantic-engine';
import { AnswerAction, SecurityContext, SemanticAnswer } from '../semantic/types';
import { commandsService } from '../services/commands.service';
import { getAnchorDates } from '../services/transactions.service';
import { appendMessage, clearWorkflowState, getOrCreateConversation, mergeEntities, setCurrentIntent, setWorkflowId } from './agent-conversation';
import { assertAgentToolAllowed } from './agent-tool-registry';
import { understand } from './gemini-semantic-engine';
import { formatAmount } from './response-templates';
import {
  buildCancelledMessage,
  buildCheckerBlockedMessage,
  buildClarificationQuestion,
  buildFailureMessage,
  buildGenericFallbackMessage,
} from './response-templates';
import { AgentEntities, AgentIntent, EntityField, REQUIRED_FIELDS_BY_INTENT, WRITE_INTENTS } from './schemas/semantic-understanding.schema';
import { AgentWorkflow, createWorkflow, findOpenWorkflowForUser, transition, WorkflowStatus } from './workflow-engine';

export interface AgentResponse {
  /** 'ANSWERED' covers both the general_question pass-through and a plain informational read
   * result — neither one is a multi-step workflow the customer needs to track further. */
  status: 'ANSWERED' | WorkflowStatus;
  /** Which agent intent produced this response — omitted only when no classification happened
   * at all (there is none for a pre-classification error). Mainly for observability/testing;
   * the UI does not need to branch on it (the message is already fully phrased). */
  intent?: AgentIntent;
  message: string;
  workflowId?: string;
  /** Only present on WAITING_APPROVAL — the frontend must echo this back on
   * POST /api/agent/workflow/:id/approve (spec §13). */
  idempotencyKey?: string;
  preview?: Record<string, unknown>;
  missingFields?: string[];
  result?: unknown;
  /** Navigation CTA(s) for an ANSWERED/COMPLETED read response — same shape and `target`
   * vocabulary (OPEN_ACCOUNT, OPEN_LC_DETAIL, ...) the deterministic Semantic Engine's own
   * SemanticAnswer already uses (see semantic/types.ts's AnswerAction and rm-data.service.ts's
   * NAV_ACTION_ROUTES/buildLink). Previously only the deterministic (non-Agent) chat path ever
   * populated these, so every Agent answer — including `general_question`, which literally reuses
   * `answerQuery()` — rendered as plain text with no CTA at all, even when the underlying answer
   * already had one computed and ready. */
  action?: AnswerAction;
  actions?: AnswerAction[];
  /** Present alongside `action`/`actions` when the answer is naturally a list (e.g. multiple LC
   * matches) — mirrors SemanticAnswer.records so the frontend can render the same grouped
   * RECORD_LIST card the deterministic path uses instead of a flat text summary. */
  records?: unknown[];
  answerTitle?: string;
  /** Set only when the Agent hands a write intent off to a real BankingCommand draft (spec §7
   * "form-driven agent" — Slice 5 of docs/MAKER_CHECKER_AUDIT.md) instead of running its own
   * Approval Gate. The frontend opens the matching banking form pre-filled with this draft
   * rather than rendering a WAITING_APPROVAL card. */
  commandId?: string;
}

const CANCEL_PHRASES = ['hủy', 'huỷ', 'thôi khỏi', 'không muốn nữa', 'dừng lại', 'bỏ qua yêu cầu', 'thôi không cần'];

function looksLikeCancel(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return CANCEL_PHRASES.some((p) => normalized.includes(p));
}

const READ_TOOL_MAP: Partial<Record<AgentIntent, string>> = {
  check_balance: 'get_balance',
  track_transaction: 'search_transaction',
  transaction_search: 'search_transaction',
  check_lc_status: 'check_lc_status',
  check_guarantee_status: 'check_guarantee_status',
  check_collection_status: 'check_collection_status',
  product_information: 'search_product_information',
  contact_rm: 'contact_rm',
};

function strVal(entities: AgentEntities, field: EntityField): string | undefined {
  const e = entities[field];
  return e === undefined ? undefined : String(e.value);
}

function readToolParams(intent: AgentIntent, entities: AgentEntities): Record<string, unknown> {
  switch (intent) {
    case 'check_balance':
      return { accountNumber: strVal(entities, 'accountNumber') };
    case 'track_transaction':
    case 'transaction_search':
      return { transactionId: strVal(entities, 'transactionId') };
    case 'check_lc_status':
      return { lcNumber: strVal(entities, 'transactionId') };
    case 'check_guarantee_status':
      return { bgNumber: strVal(entities, 'transactionId') };
    case 'check_collection_status':
      return { collectionNumber: strVal(entities, 'transactionId') };
    default:
      return {};
  }
}

function formatReadResultMessage(intent: AgentIntent, result: unknown): string {
  switch (intent) {
    case 'check_balance': {
      const acc = result as { accountName: string; balance: number; currency: string } | undefined;
      return acc ? `Số dư tài khoản ${acc.accountName}: ${formatAmount(acc.balance, acc.currency)}.` : 'Em chưa tìm thấy tài khoản phù hợp.';
    }
    case 'track_transaction':
    case 'transaction_search': {
      const r = result as { found: boolean; transaction?: { id: string; description: string; amount: number; currency: string; status: string }; recent?: unknown[] };
      if (r.transaction) return `Giao dịch ${r.transaction.id}: ${r.transaction.description} — ${formatAmount(r.transaction.amount, r.transaction.currency)}, trạng thái ${r.transaction.status}.`;
      if (r.recent?.length) return `Em tìm thấy ${r.recent.length} giao dịch gần đây.`;
      return 'Em chưa tìm thấy giao dịch phù hợp.';
    }
    case 'check_lc_status': {
      const list = result as { lcNumber: string }[];
      return list.length ? `Có ${list.length} LC phù hợp: ${list.map((l) => l.lcNumber).join(', ')}.` : 'Em chưa tìm thấy LC phù hợp.';
    }
    case 'check_guarantee_status': {
      const list = result as { bgNumber: string }[];
      return list.length ? `Có ${list.length} bảo lãnh phù hợp: ${list.map((g) => g.bgNumber).join(', ')}.` : 'Em chưa tìm thấy bảo lãnh phù hợp.';
    }
    case 'check_collection_status': {
      const list = result as { collectionNumber: string }[];
      return list.length ? `Có ${list.length} bộ nhờ thu phù hợp: ${list.map((c) => c.collectionNumber).join(', ')}.` : 'Em chưa tìm thấy bộ nhờ thu phù hợp.';
    }
    case 'product_information':
      return 'Em đã tìm thông tin sản phẩm phù hợp, anh/chị xem chi tiết bên dưới nhé.';
    case 'contact_rm':
      return (result as { message: string }).message;
    default:
      return 'Đã có kết quả.';
  }
}

/** Navigation CTA for a READ_TOOL_MAP result — these tools (agent-mock-tools.ts) are Agent-only,
 * with no equivalent in the deterministic Semantic Engine, so there is nothing existing to reuse
 * here the way general_question reuses answerQuery()'s own action. `target` strings are the same
 * vocabulary NAV_ACTION_ROUTES (rm-data.service.ts) already maps to real routes. Only attaches an
 * `entityId` where a matching Angular `:id` detail route actually exists (LC/Guarantee/Collection)
 * — deliberately NOT for accounts/transactions, which only have list routes today. */
function buildReadResultAction(intent: AgentIntent, result: unknown): AnswerAction | undefined {
  switch (intent) {
    case 'check_balance': {
      const acc = result as { accountName: string } | undefined;
      return acc ? { label: 'Xem tài khoản', type: 'NAVIGATE', target: 'OPEN_ACCOUNT' } : undefined;
    }
    case 'track_transaction':
    case 'transaction_search': {
      const r = result as { transaction?: unknown; recent?: unknown[] };
      return r.transaction || r.recent?.length ? { label: 'Xem giao dịch', type: 'NAVIGATE', target: 'OPEN_TRANSACTION' } : undefined;
    }
    case 'check_lc_status': {
      const list = result as { lcNumber: string }[];
      if (!list.length) return undefined;
      return list.length === 1
        ? { label: `Xem ${list[0].lcNumber}`, type: 'NAVIGATE', target: 'OPEN_LC_DETAIL', entityId: list[0].lcNumber }
        : { label: 'Xem danh sách LC', type: 'NAVIGATE', target: 'OPEN_LC' };
    }
    case 'check_guarantee_status': {
      const list = result as { bgNumber: string }[];
      if (!list.length) return undefined;
      return list.length === 1
        ? { label: `Xem ${list[0].bgNumber}`, type: 'NAVIGATE', target: 'OPEN_GUARANTEE_DETAIL', entityId: list[0].bgNumber }
        : { label: 'Xem danh sách bảo lãnh', type: 'NAVIGATE', target: 'OPEN_GUARANTEE' };
    }
    case 'check_collection_status': {
      const list = result as { collectionNumber: string }[];
      if (!list.length) return undefined;
      return list.length === 1
        ? { label: `Xem ${list[0].collectionNumber}`, type: 'NAVIGATE', target: 'OPEN_COLLECTION_DETAIL', entityId: list[0].collectionNumber }
        : { label: 'Xem danh sách nhờ thu', type: 'NAVIGATE', target: 'OPEN_COLLECTION' };
    }
    case 'product_information':
      return { label: 'Xem sản phẩm', type: 'NAVIGATE', target: 'OPEN_PRODUCT' };
    default:
      return undefined;
  }
}

/** spec §21 — structured, high-level events only. Never logs entities/preview/result content
 * (could carry a beneficiary name or amount), only ids/intent/status — same discipline
 * gemini-client.ts already applies to its own request logging. */
function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

function finalize(sessionId: string, response: AgentResponse): AgentResponse {
  appendMessage(sessionId, { role: 'agent', content: response.message });
  return response;
}

/** Decides the next step for a write-intent workflow that now has `entities` merged in — called
 * both on the first turn (right after Gemini understanding) and after a clarification reply.
 * Entry-agnostic on purpose: legal from both UNDERSTANDING and NEEDS_CLARIFICATION (see
 * workflow-engine.ts's ALLOWED_TRANSITIONS), so callers never need to pre-transition themselves. */
function planWrite(workflow: AgentWorkflow, intent: AgentIntent, entities: AgentEntities, ctx: UserContext, sessionId: string): AgentResponse {
  const required = REQUIRED_FIELDS_BY_INTENT[intent] ?? [];
  const stillMissing = required.filter((field) => !entities[field]);

  if (stillMissing.length > 0) {
    transition(workflow.workflowId, 'NEEDS_CLARIFICATION', { entities });
    return finalize(sessionId, {
      status: 'NEEDS_CLARIFICATION',
      intent,
      workflowId: workflow.workflowId,
      missingFields: stillMissing,
      message: buildClarificationQuestion(intent, stillMissing, entities),
    });
  }

  transition(workflow.workflowId, 'PLANNING', { entities });

  // Maker/Checker upgrade (docs/MAKER_CHECKER_AUDIT.md Slices 5+6) — every write intent hands off
  // to a real BankingCommand draft instead of running the Agent's own Approval Gate. There is no
  // longer a WAITING_APPROVAL destination for any write intent — the old draft-tool/execute-tool
  // path (create_transfer_draft/execute_transfer, create_lc_draft/submit_lc_mock, etc.) is unused
  // by the orchestrator now, though the underlying AgentTools still exist and are still directly
  // unit-tested (approval-gate.ts's own checklist).
  // Cast is sound: planWrite is only ever called for a write intent (WRITE_INTENTS.has(...) gates
  // every call site — dispatchIntent and continueClarification's topic-unchanged path).
  return handOffWriteIntent(intent as 'create_transfer' | 'create_lc' | 'create_guarantee' | 'create_collection', workflow, entities, ctx, sessionId);
}

const HANDOFF_COMMAND_TYPE: Record<'create_transfer' | 'create_lc' | 'create_guarantee' | 'create_collection', CommandType> = {
  create_transfer: 'TRANSFER',
  create_lc: 'LC',
  create_guarantee: 'GUARANTEE',
  create_collection: 'COLLECTION',
};

/** Same LC/guarantee/collection defaults the standalone create-forms themselves already fall
 * back to (lc-create.page.ts/guarantee-create.page.ts/collection-create.page.ts) — kept in sync
 * by hand since front/back don't share constants in this codebase (established convention, see
 * beneficiary-banks.ts's own header comment); duplicated here so a draft loaded into the real
 * form looks exactly like one a Maker filled in by hand, not missing fields the form's own
 * defaults would otherwise have caught. */
function buildWriteFormData(intent: 'create_lc' | 'create_guarantee' | 'create_collection', entities: AgentEntities): Record<string, unknown> {
  const str = (e: AgentEntities[keyof AgentEntities]) => (e ? String(e.value) : undefined);
  const num = (e: AgentEntities[keyof AgentEntities]) => (e ? Number(e.value) : undefined);
  const fallbackDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  if (intent === 'create_lc') {
    return {
      type: 'IMPORT',
      subType: str(entities.lcType)?.toUpperCase() === 'USANCE' ? 'USANCE' : 'SIGHT',
      beneficiary: str(entities.beneficiary),
      applicant: str(entities.applicant) ?? 'ABC Manufacturing JSC',
      issuingBank: 'MSB',
      advisingBank: '',
      currency: str(entities.lcCurrency) ?? 'USD',
      amount: num(entities.lcAmount),
      latestShipmentDate: fallbackDate(30),
      expiryDate: str(entities.expiryDate) ?? fallbackDate(45),
      requiredDocuments: ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING'],
    };
  }
  if (intent === 'create_guarantee') {
    const typeRaw = str(entities.guaranteeType)?.toUpperCase();
    const type = typeRaw === 'PERFORMANCE_BOND' || typeRaw === 'ADVANCE_PAYMENT' || typeRaw === 'PAYMENT_GUARANTEE' ? typeRaw : 'BID_BOND';
    return {
      type,
      beneficiary: str(entities.beneficiary) ?? str(entities.beneficiaryName) ?? 'Beneficiary (demo)',
      applicant: 'ABC Manufacturing JSC',
      currency: str(entities.currency) ?? 'VND',
      amount: num(entities.guaranteeAmount),
      expiryDate: str(entities.expiryDate) ?? fallbackDate(90),
    };
  }
  // create_collection
  return {
    type: 'EXPORT',
    subType: str(entities.collectionType)?.toUpperCase() === 'DA' ? 'DA' : 'DP',
    direction: 'OUTWARD',
    drawer: 'ABC Manufacturing JSC',
    drawee: str(entities.beneficiaryName) ?? str(entities.beneficiary) ?? 'Đối tác (demo)',
    currency: str(entities.currency) ?? 'USD',
    amount: num(entities.amount),
    dueDate: str(entities.date) ?? fallbackDate(30),
  };
}

const HANDOFF_FORM_ROUTE: Record<CommandType, string> = {
  TRANSFER: 'form chuyển tiền',
  LC: 'form mở LC (/trade-finance/lc/create)',
  GUARANTEE: 'form phát hành bảo lãnh (/trade-finance/guarantees/create)',
  COLLECTION: 'form tạo nhờ thu (/trade-finance/collections/create)',
};

/**
 * spec §7 "form-driven agent": once required entities are known for ANY write intent, the
 * Agent's job is to PRE-FILL a real BankingCommand draft and hand off — never to draft its own
 * preview or wait for its own approval (docs/MAKER_CHECKER_AUDIT.md Slice 5 for create_transfer,
 * Slice 6 for the other 3 — closing the same gap consistently for every write intent, not just
 * transfer). The Maker completes whatever Gemini couldn't extract in the real banking form, which
 * runs the exact same validation/warning/submit path as filling it in by hand. The Agent's own
 * workflow ends here at COMPLETED — there is no WAITING_APPROVAL step left for any write intent.
 */
function handOffWriteIntent(intent: 'create_transfer' | 'create_lc' | 'create_guarantee' | 'create_collection', workflow: AgentWorkflow, entities: AgentEntities, ctx: UserContext, sessionId: string): AgentResponse {
  const commandType = HANDOFF_COMMAND_TYPE[intent];
  try {
    let formData: Record<string, unknown>;
    let summary: string;

    if (intent === 'create_transfer') {
      const amount = entities.amount ? Number(entities.amount.value) : undefined;
      const beneficiaryName = entities.beneficiaryName ? String(entities.beneficiaryName.value) : undefined;
      if (!amount || !beneficiaryName) throw new Error('create_transfer hand-off requires amount and beneficiaryName');
      const currency = entities.currency ? String(entities.currency.value) : 'VND';
      formData = { amount, beneficiaryName, currency };
      if (entities.sourceAccount) formData['sourceAccount'] = String(entities.sourceAccount.value);
      summary = `${formatAmount(amount, currency)} chuyển cho ${beneficiaryName}`;
    } else {
      formData = buildWriteFormData(intent, entities);
      const required = REQUIRED_FIELDS_BY_INTENT[intent] ?? [];
      if (required.some((f) => !entities[f])) throw new Error(`${intent} hand-off called before required entities were known`);
      summary = `yêu cầu ${intent === 'create_lc' ? 'mở LC' : intent === 'create_guarantee' ? 'phát hành bảo lãnh' : 'tạo nhờ thu'}`;
    }

    const displayName = findUser(ctx.userId)?.displayName ?? ctx.userId;
    const draft = commandsService.createDraft({ userId: ctx.userId, displayName, role: ctx.role ?? 'MAKER' }, commandType, formData, {
      originalMessage: lastUserMessage(sessionId),
      intent,
      entities: entities as unknown as Record<string, unknown>,
    });

    // PLANNING has no direct edge to COMPLETED (workflow-engine.ts) — creating the draft IS the
    // Agent's own "execution" of its job (understand + prepare), same shape executeReadIntent()
    // already uses for read intents.
    transition(workflow.workflowId, 'EXECUTING');
    const completed = transition(workflow.workflowId, 'COMPLETED', { result: { commandId: draft.id, referenceNo: draft.referenceNo } });
    logEvent('agent.workflow.completed', { workflowId: completed.workflowId, intent, commandId: draft.id });
    clearWorkflowState(sessionId);

    return finalize(sessionId, {
      status: 'ANSWERED',
      intent,
      workflowId: completed.workflowId,
      commandId: draft.id,
      message: `Em đã chuẩn bị sẵn ${summary} trong ${HANDOFF_FORM_ROUTE[commandType]} (${draft.referenceNo}). Anh/chị mở form để bổ sung/kiểm tra thông tin còn thiếu rồi gửi duyệt nhé.`,
    });
  } catch (err) {
    transition(workflow.workflowId, 'FAILED', { error: err instanceof Error ? err.message : String(err) });
    logEvent('agent.workflow.failed', { workflowId: workflow.workflowId, intent, stage: 'planning' });
    clearWorkflowState(sessionId);
    return finalize(sessionId, { status: 'FAILED', intent, workflowId: workflow.workflowId, message: buildFailureMessage() });
  }
}

async function continueClarification(workflow: AgentWorkflow, message: string, ctx: UserContext, security: SecurityContext, sessionId: string, anchorToday: string): Promise<AgentResponse> {
  const conversation = getOrCreateConversation(sessionId);
  const { understanding } = await understand(
    { message, history: conversation.messages.map((m) => ({ role: m.role, content: m.content })), knownEntities: workflow.entities },
    anchorToday,
  );

  // Topic change: a message classified into a DIFFERENT intent almost certainly isn't answering
  // the open clarification — it's a new request. Only 'unknown' stays as a possible continuation
  // (a short, ambiguous reply like "5 triệu" or a bare name legitimately classifies as 'unknown'
  // on its own — see fallback-rule-engine.ts — and should still be merged, not treated as a topic
  // change). 'general_question' always counts as a topic change regardless of confidence: the
  // fallback engine's own general_question branch already requires the message to look
  // question-shaped (length > 8, see fallback-rule-engine.ts) before ever producing it, so that
  // signal alone is trustworthy even at its usual 0.4 score — gating it behind >= 0.5 like other
  // intents left a real bug: "Tỷ giá USD hôm nay?" asked mid "chuyển tiền" clarification stayed
  // stuck re-asking "who do you want to send this to", confirmed live via Playwright before this
  // fix (screenshot showed the FX question swallowed instead of answered). Every other
  // actionable intent still needs >= 0.5 before abandoning a real in-progress write workflow.
  const isTopicChange =
    understanding.intent !== workflow.intent &&
    understanding.intent !== 'unknown' &&
    (understanding.intent === 'general_question' || understanding.confidence >= 0.5);
  if (isTopicChange) {
    transition(workflow.workflowId, 'CANCELLED');
    logEvent('agent.workflow.cancelled', { workflowId: workflow.workflowId, reason: 'topic_change' });
    clearWorkflowState(sessionId);
    setCurrentIntent(sessionId, understanding.intent);
    return dispatchIntent(understanding, ctx, security, sessionId);
  }

  const mergedEntities: AgentEntities = { ...workflow.entities, ...understanding.entities };
  mergeEntities(sessionId, understanding.entities);
  // The clarification reply answers the ALREADY-open workflow's intent, regardless of what a
  // short follow-up like "5 triệu" would classify as on its own (spec §8: merge, don't restart).
  return planWrite(workflow, workflow.intent, mergedEntities, ctx, sessionId);
}

export interface Understanding {
  intent: AgentIntent;
  confidence: number;
  entities: AgentEntities;
}

/** Shared by the fresh-turn path in handleMessage() and continueClarification()'s topic-change
 * branch, so the write/read/general/unknown routing logic exists in exactly one place. */
/** Exported for direct unit testing (server/test/commands-domain.test.ts's Agent hand-off tests)
 * — real Gemini/fallback understanding can't be forced to extract both amount AND
 * beneficiaryName together for create_transfer (docs/SEMANTIC_MODEL.md §6's known fallback
 * limitation), so exercising handOffTransferDraft() end to end needs a synthetic Understanding,
 * the same way workflow-engine.ts/approval-gate.ts are already tested with hand-built state
 * rather than only through handleMessage(). */
export function dispatchIntent(understanding: Understanding, ctx: UserContext, security: SecurityContext, sessionId: string): AgentResponse | Promise<AgentResponse> {
  if (understanding.intent === 'unknown') {
    return finalize(sessionId, { status: 'ANSWERED', intent: 'unknown', message: 'Xin lỗi, em chưa hiểu rõ yêu cầu này. Anh/chị có thể nói rõ hơn được không ạ?' });
  }

  if (understanding.intent === 'general_question') {
    // Reuse the existing, well-tested 61-intent deterministic engine wholesale — the Agent
    // never re-implements Q&A it already has (docs/GEMINI_AGENT_AUDIT.md §10). Carry through the
    // answer's own action/actions/records/title too, not just its text summary — these were
    // previously dropped here, which is why every general_question reply in Agent mode rendered
    // with no CTA even though the exact same question in the non-Agent chat had one.
    const result = answerQuery(lastUserMessage(sessionId), security, {});
    // ClarificationResult's `answer` is a narrower shape with no action/actions field at all (a
    // "please clarify" prompt genuinely has no CTA) — SemanticQueryResult's full SemanticAnswer
    // does. Both share title/summary/records, so a Partial<SemanticAnswer> cast is safe here.
    const answer = result.answer as Partial<SemanticAnswer>;
    return finalize(sessionId, {
      status: 'ANSWERED',
      intent: 'general_question',
      message: answer.summary ?? '',
      answerTitle: answer.title,
      action: answer.action,
      actions: answer.actions,
      records: answer.records?.length ? answer.records : undefined,
    });
  }

  if (WRITE_INTENTS.has(understanding.intent)) {
    if (ctx.role !== 'MAKER' && ctx.role !== 'ADMIN') {
      return finalize(sessionId, { status: 'ANSWERED', intent: understanding.intent, message: buildCheckerBlockedMessage() });
    }
    const workflow = createWorkflow({ userId: sessionId, intent: understanding.intent, entities: understanding.entities });
    logEvent('agent.workflow.created', { workflowId: workflow.workflowId, intent: understanding.intent });
    mergeEntities(sessionId, understanding.entities);
    setWorkflowId(sessionId, workflow.workflowId);
    return planWrite(workflow, understanding.intent, understanding.entities, ctx, sessionId);
  }

  if (READ_TOOL_MAP[understanding.intent]) {
    return executeReadIntent(understanding.intent, understanding.entities, ctx, sessionId);
  }

  return finalize(sessionId, { status: 'ANSWERED', intent: understanding.intent, message: buildGenericFallbackMessage() });
}

function lastUserMessage(sessionId: string): string {
  const conversation = getOrCreateConversation(sessionId);
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    if (conversation.messages[i].role === 'user') return conversation.messages[i].content;
  }
  return '';
}

async function executeReadIntent(intent: AgentIntent, entities: AgentEntities, ctx: UserContext, sessionId: string): Promise<AgentResponse> {
  const toolName = READ_TOOL_MAP[intent]!;
  const workflow = createWorkflow({ userId: sessionId, intent, entities });
  logEvent('agent.workflow.created', { workflowId: workflow.workflowId, intent });
  transition(workflow.workflowId, 'PLANNING', { toolName });
  transition(workflow.workflowId, 'EXECUTING');
  try {
    const tool = assertAgentToolAllowed(toolName, ctx.role);
    const result = await tool.execute(ctx, readToolParams(intent, entities));
    transition(workflow.workflowId, 'COMPLETED', { result });
    logEvent('agent.workflow.completed', { workflowId: workflow.workflowId, intent });
    clearWorkflowState(sessionId);
    return finalize(sessionId, {
      status: 'COMPLETED',
      intent,
      workflowId: workflow.workflowId,
      result,
      message: formatReadResultMessage(intent, result),
      action: buildReadResultAction(intent, result),
      // Only check_lc_status/check_guarantee_status/check_collection_status return an array
      // (formatReadResultMessage's own type casts confirm this — everything else returns an
      // object) — forwarding it lets the frontend render the same grouped RECORD_LIST card the
      // deterministic chat uses for multiple matches, instead of a flat "N found" sentence.
      records: Array.isArray(result) && result.length > 1 ? result : undefined,
    });
  } catch (err) {
    transition(workflow.workflowId, 'FAILED', { error: err instanceof Error ? err.message : String(err) });
    logEvent('agent.workflow.failed', { workflowId: workflow.workflowId, intent, stage: 'executing' });
    clearWorkflowState(sessionId);
    return finalize(sessionId, { status: 'FAILED', intent, workflowId: workflow.workflowId, message: buildFailureMessage() });
  }
}

export interface HandleMessageInput {
  message: string;
  security: SecurityContext;
}

/**
 * The single entry point Phase G's controller calls. Never throws for an expected failure mode
 * (Gemini down, unknown intent, missing fields, disallowed role) — every one of those is a
 * normal `AgentResponse`, not an exception; only a genuine bug should reach the controller as an
 * unhandled error.
 */
export async function handleMessage(input: HandleMessageInput): Promise<AgentResponse> {
  const ctx = toUserContext(input.security);
  const sessionId = ctx.userId;
  appendMessage(sessionId, { role: 'user', content: input.message });

  const openWorkflow = findOpenWorkflowForUser(sessionId);
  const anchorToday = getAnchorDates().today;

  if (openWorkflow?.status === 'WAITING_APPROVAL') {
    if (looksLikeCancel(input.message)) {
      transition(openWorkflow.workflowId, 'CANCELLED');
      logEvent('agent.workflow.cancelled', { workflowId: openWorkflow.workflowId });
      clearWorkflowState(sessionId);
      return finalize(sessionId, { status: 'CANCELLED', intent: openWorkflow.intent, workflowId: openWorkflow.workflowId, message: buildCancelledMessage() });
    }
    // spec §11: "Không chấp nhận 'OK' từ LLM như một approval" — a plain chat message can never
    // approve; only the dedicated approve endpoint (Phase F/G) counts as explicit user action.
    return finalize(sessionId, {
      status: 'WAITING_APPROVAL',
      intent: openWorkflow.intent,
      workflowId: openWorkflow.workflowId,
      idempotencyKey: openWorkflow.idempotencyKey,
      preview: openWorkflow.preview,
      message: 'Anh/chị vui lòng bấm Xác nhận hoặc Hủy trên yêu cầu đang chờ bên trên nhé — để đảm bảo an toàn, em không thể tự xác nhận thay qua tin nhắn.',
    });
  }

  if (openWorkflow?.status === 'NEEDS_CLARIFICATION') {
    if (looksLikeCancel(input.message)) {
      transition(openWorkflow.workflowId, 'CANCELLED');
      logEvent('agent.workflow.cancelled', { workflowId: openWorkflow.workflowId });
      clearWorkflowState(sessionId);
      return finalize(sessionId, { status: 'CANCELLED', intent: openWorkflow.intent, workflowId: openWorkflow.workflowId, message: buildCancelledMessage() });
    }
    return continueClarification(openWorkflow, input.message, ctx, input.security, sessionId, anchorToday);
  }

  const conversation = getOrCreateConversation(sessionId);
  const { understanding } = await understand(
    { message: input.message, history: conversation.messages.map((m) => ({ role: m.role, content: m.content })) },
    anchorToday,
  );
  setCurrentIntent(sessionId, understanding.intent);
  return dispatchIntent(understanding, ctx, input.security, sessionId);
}
