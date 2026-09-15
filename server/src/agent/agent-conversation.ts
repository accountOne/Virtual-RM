// Multi-turn conversation memory for the Gemini Agent (spec §14) — deliberately a DIFFERENT,
// separate store from server/src/ai/conversation-context.ts, which only remembers one narrow
// thing (last intent + last currency) for the existing deterministic engine's follow-up
// resolver. This one carries the full message history + accumulated entities + the workflow the
// conversation is currently attached to, per the spec's own shape:
//
//   interface ConversationContext { sessionId, messages, currentIntent, entities, workflowId }
//
// In-memory only (spec §14: "Không cần vector DB/RAG/Redis. In-memory là đủ cho demo"), keyed by
// the authenticated userId (same identity source as every other per-user store in this codebase
// — see ai/conversation-context.ts's own precedent) rather than inventing a second session
// concept on top of the real HTTP auth session. Designed so swapping the Map for Redis later is
// a one-file change: every read/write goes through the functions below, nothing reaches into the
// Map directly from outside this file.

import { AgentEntities, AgentIntent } from './schemas/semantic-understanding.schema';

export interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

export interface AgentConversationContext {
  sessionId: string;
  messages: AgentMessage[];
  currentIntent?: AgentIntent;
  entities: AgentEntities;
  workflowId?: string;
}

const MAX_MESSAGES_KEPT = 20;

const store = new Map<string, AgentConversationContext>();

function newContext(sessionId: string): AgentConversationContext {
  return { sessionId, messages: [], entities: {} };
}

export function getOrCreateConversation(sessionId: string): AgentConversationContext {
  let ctx = store.get(sessionId);
  if (!ctx) {
    ctx = newContext(sessionId);
    store.set(sessionId, ctx);
  }
  return ctx;
}

export function appendMessage(sessionId: string, message: Omit<AgentMessage, 'timestamp'>): void {
  const ctx = getOrCreateConversation(sessionId);
  ctx.messages.push({ ...message, timestamp: Date.now() });
  if (ctx.messages.length > MAX_MESSAGES_KEPT) ctx.messages.splice(0, ctx.messages.length - MAX_MESSAGES_KEPT);
}

/** Merges newly-extracted entities into the running set for this conversation — never wipes
 * out something confirmed earlier just because the latest turn didn't mention it again (spec
 * §8: "Không reset toàn bộ context"). A field present in `entities` always overrides the
 * existing value (the newest turn is the most specific signal available). */
export function mergeEntities(sessionId: string, entities: AgentEntities): AgentConversationContext {
  const ctx = getOrCreateConversation(sessionId);
  ctx.entities = { ...ctx.entities, ...entities };
  return ctx;
}

export function setCurrentIntent(sessionId: string, intent: AgentIntent | undefined): void {
  getOrCreateConversation(sessionId).currentIntent = intent;
}

export function setWorkflowId(sessionId: string, workflowId: string | undefined): void {
  getOrCreateConversation(sessionId).workflowId = workflowId;
}

/** Called when a workflow reaches a terminal state (COMPLETED/FAILED/CANCELLED) or the customer
 * starts a visibly new topic — clears the workflow link and accumulated entities, but keeps the
 * message history for tone/continuity. */
export function clearWorkflowState(sessionId: string): void {
  const ctx = getOrCreateConversation(sessionId);
  ctx.workflowId = undefined;
  ctx.entities = {};
  ctx.currentIntent = undefined;
}

export function _resetAgentConversationsForTests(): void {
  store.clear();
}
