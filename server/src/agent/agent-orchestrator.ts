// Agent Orchestrator — the single place that decides what happens next (spec §0's own split:
// "LLM = Understanding + Reasoning, Agent = Decision + Workflow orchestration"). Gemini never
// calls a tool and never sets a workflow status; every branch below is plain, auditable
// TypeScript control flow, not a model decision.

import { toUserContext, UserContext } from '../ai/types';
import { answerQuery } from '../semantic/semantic-engine';
import { SecurityContext } from '../semantic/types';
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
  buildPreviewMessage,
} from './response-templates';
import { AgentEntities, AgentIntent, EntityField, REQUIRED_FIELDS_BY_INTENT } from './schemas/semantic-understanding.schema';
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
}

const CANCEL_PHRASES = ['hủy', 'huỷ', 'thôi khỏi', 'không muốn nữa', 'dừng lại', 'bỏ qua yêu cầu', 'thôi không cần'];

function looksLikeCancel(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return CANCEL_PHRASES.some((p) => normalized.includes(p));
}

const WRITE_TOOL_MAP: Partial<Record<AgentIntent, { draft: string; execute: string }>> = {
  create_transfer: { draft: 'create_transfer_draft', execute: 'execute_transfer' },
  create_lc: { draft: 'create_lc_draft', execute: 'submit_lc_mock' },
  create_guarantee: { draft: 'create_guarantee_draft', execute: 'submit_guarantee_mock' },
  create_collection: { draft: 'create_collection_draft', execute: 'submit_collection_mock' },
};

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
  const map = WRITE_TOOL_MAP[intent]!;
  try {
    const draftTool = assertAgentToolAllowed(map.draft, ctx.role);
    const preview = draftTool.execute(ctx, { entities }) as Record<string, unknown>;
    const waiting = transition(workflow.workflowId, 'WAITING_APPROVAL', { toolName: map.execute, preview });
    logEvent('agent.workflow.waiting_approval', { workflowId: waiting.workflowId, intent, toolName: map.execute });
    return finalize(sessionId, {
      status: 'WAITING_APPROVAL',
      intent,
      workflowId: waiting.workflowId,
      idempotencyKey: waiting.idempotencyKey,
      preview,
      message: buildPreviewMessage(intent, preview),
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

interface Understanding {
  intent: AgentIntent;
  confidence: number;
  entities: AgentEntities;
}

/** Shared by the fresh-turn path in handleMessage() and continueClarification()'s topic-change
 * branch, so the write/read/general/unknown routing logic exists in exactly one place. */
function dispatchIntent(understanding: Understanding, ctx: UserContext, security: SecurityContext, sessionId: string): AgentResponse | Promise<AgentResponse> {
  if (understanding.intent === 'unknown') {
    return finalize(sessionId, { status: 'ANSWERED', intent: 'unknown', message: 'Xin lỗi, em chưa hiểu rõ yêu cầu này. Anh/chị có thể nói rõ hơn được không ạ?' });
  }

  if (understanding.intent === 'general_question') {
    // Reuse the existing, well-tested 61-intent deterministic engine wholesale — the Agent
    // never re-implements Q&A it already has (docs/GEMINI_AGENT_AUDIT.md §10).
    const result = answerQuery(lastUserMessage(sessionId), security, {});
    return finalize(sessionId, { status: 'ANSWERED', intent: 'general_question', message: result.answer.summary });
  }

  const writeMap = WRITE_TOOL_MAP[understanding.intent];
  if (writeMap) {
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
    return finalize(sessionId, { status: 'COMPLETED', intent, workflowId: workflow.workflowId, result, message: formatReadResultMessage(intent, result) });
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
