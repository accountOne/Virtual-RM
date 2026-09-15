// Agent workflow state machine (spec §9). This is the ONLY place a workflow's status changes —
// the Gemini semantic layer never sets a status, a tool never sets a status, only functions in
// this file do, and only along an edge listed in ALLOWED_TRANSITIONS below. In-memory store
// (spec §14 — no DB needed for a demo), keyed by a generated workflowId.
//
//   UNDERSTANDING -> NEEDS_CLARIFICATION -> PLANNING -> WAITING_APPROVAL -> EXECUTING -> COMPLETED
//                                                    \-> EXECUTING (read-only intents skip approval)
//   any non-terminal state -> CANCELLED
//   PLANNING/EXECUTING -> FAILED

import { randomUUID } from 'crypto';
import { AgentEntities, AgentIntent } from './schemas/semantic-understanding.schema';

export type WorkflowStatus = 'UNDERSTANDING' | 'NEEDS_CLARIFICATION' | 'PLANNING' | 'WAITING_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export const TERMINAL_STATUSES: ReadonlySet<WorkflowStatus> = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export interface AgentWorkflow {
  workflowId: string;
  userId: string;
  intent: AgentIntent;
  entities: AgentEntities;
  status: WorkflowStatus;
  /** Which AgentTool (Phase E) this workflow will call, once PLANNING has decided. */
  toolName?: string;
  /** Draft preview shown to the customer in the WAITING_APPROVAL card (spec §11's UI mock). */
  preview?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  /** Spec §13 — a fresh key per workflow; approval-gate.ts (Phase F) refuses to execute the
   * same key twice, independent of the status check below (defense-in-depth). */
  idempotencyKey: string;
  /** Set only once EXECUTING actually starts — a second approve attempt on an already-executing/
   * executed workflow is rejected by the status check before this would ever be set twice. */
  executionId?: string;
  createdAt: number;
  updatedAt: number;
}

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  UNDERSTANDING: ['NEEDS_CLARIFICATION', 'PLANNING', 'CANCELLED', 'FAILED'],
  NEEDS_CLARIFICATION: ['NEEDS_CLARIFICATION', 'PLANNING', 'CANCELLED'],
  PLANNING: ['WAITING_APPROVAL', 'EXECUTING', 'FAILED', 'CANCELLED'],
  WAITING_APPROVAL: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class InvalidWorkflowTransitionError extends Error {
  constructor(
    readonly from: WorkflowStatus,
    readonly to: WorkflowStatus,
  ) {
    super(`Illegal workflow transition: ${from} -> ${to}`);
    this.name = 'InvalidWorkflowTransitionError';
  }
}

const workflows = new Map<string, AgentWorkflow>();

export function createWorkflow(input: { userId: string; intent: AgentIntent; entities: AgentEntities }): AgentWorkflow {
  const now = Date.now();
  const workflow: AgentWorkflow = {
    workflowId: `WF-${randomUUID()}`,
    userId: input.userId,
    intent: input.intent,
    entities: input.entities,
    status: 'UNDERSTANDING',
    idempotencyKey: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  workflows.set(workflow.workflowId, workflow);
  return workflow;
}

export function getWorkflow(workflowId: string): AgentWorkflow | undefined {
  return workflows.get(workflowId);
}

/** The one open (non-terminal) workflow for a user, if any — a clarification reply or an
 * approve/cancel click routes back into this one rather than starting a second, competing
 * workflow for the same conversation. This demo only ever runs one workflow per user at a time. */
export function findOpenWorkflowForUser(userId: string): AgentWorkflow | undefined {
  for (const wf of workflows.values()) {
    if (wf.userId === userId && !TERMINAL_STATUSES.has(wf.status)) return wf;
  }
  return undefined;
}

/** The single mutation point for a workflow's status. Throws `InvalidWorkflowTransitionError`
 * rather than silently allowing an illegal edge (e.g. approving a workflow that's already
 * EXECUTING) — callers (approval-gate.ts) turn that into a 409, never a duplicate execution. */
export function transition(workflowId: string, next: WorkflowStatus, patch: Partial<AgentWorkflow> = {}): AgentWorkflow {
  const workflow = workflows.get(workflowId);
  if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);
  if (!ALLOWED_TRANSITIONS[workflow.status].includes(next)) {
    throw new InvalidWorkflowTransitionError(workflow.status, next);
  }
  Object.assign(workflow, patch, { status: next, updatedAt: Date.now() });
  return workflow;
}

export function _resetWorkflowsForTests(): void {
  workflows.clear();
}
