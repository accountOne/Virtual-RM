// Human-in-the-loop Approval Gate (spec §11/§12/§13) — the ONLY place `execute_transfer`/
// `submit_lc_mock`/`submit_guarantee_mock`/`submit_collection_mock` (or any future
// `requiresApproval: true` tool) is ever invoked. Nothing else in this codebase calls
// `tool.execute()` for a write tool — not the semantic layer, not the orchestrator directly.
//
// This is deliberately a SEPARATE checkpoint from the existing Maker->Checker bank approval
// (transactions.controller.ts::approve/reject) — see docs/GEMINI_AGENT_AUDIT.md §8. This gate
// asks "did the SAME customer who typed the request just confirm the draft is correct?";
// the bank approval that follows (for a real PaymentOrder/LC/etc.) is a separate person,
// unaffected by anything here.

import { UserContext } from '../ai/types';
import { assertAgentToolAllowed, AgentTool } from './agent-tool-registry';
import { AgentWorkflow, getWorkflow, transition } from './workflow-engine';

const DRAFT_TTL_MS = 5 * 60_000; // spec §12 "draft not expired" — 5 minutes is generous for a demo click-through, short enough that a stale tab can't replay an old draft.

export class ApprovalValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'WRONG_STATE' | 'EXPIRED' | 'FORBIDDEN' | 'IDEMPOTENCY_MISMATCH' | 'INVALID_DRAFT',
  ) {
    super(message);
    this.name = 'ApprovalValidationError';
  }
}

function assertOwnedBy(workflow: AgentWorkflow, ctx: UserContext): void {
  if (workflow.userId !== ctx.userId) {
    throw new ApprovalValidationError('Workflow does not belong to the calling user', 'FORBIDDEN');
  }
}

function assertDraftStillSane(workflow: AgentWorkflow): void {
  const preview = workflow.preview as { amount?: number; guaranteeAmount?: number; lcAmount?: number } | undefined;
  const amount = preview?.amount;
  if (amount !== undefined && !(amount > 0)) {
    throw new ApprovalValidationError('Draft amount is no longer valid', 'INVALID_DRAFT');
  }
}

/**
 * Spec §12's full revalidation checklist, re-run on the SERVER at approve time — never trusts
 * that the state shown to the customer a moment ago is still correct: workflow exists, status is
 * exactly WAITING_APPROVAL, draft hasn't expired, the calling user owns the workflow, the tool is
 * still allowed for their role, and the idempotency key they echo back matches. Any failure
 * throws `ApprovalValidationError` — callers map this to an HTTP 409/403/400, never a silent
 * no-op and never an execution.
 */
export function validateApproval(workflowId: string, ctx: UserContext, idempotencyKey: string): { workflow: AgentWorkflow; tool: AgentTool<any, any> } {
  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new ApprovalValidationError('Workflow not found', 'NOT_FOUND');
  assertOwnedBy(workflow, ctx);
  if (workflow.status !== 'WAITING_APPROVAL') {
    throw new ApprovalValidationError(`Workflow is not awaiting approval (status: ${workflow.status})`, 'WRONG_STATE');
  }
  if (Date.now() - workflow.updatedAt > DRAFT_TTL_MS) {
    throw new ApprovalValidationError('Draft has expired — please ask again', 'EXPIRED');
  }
  if (workflow.idempotencyKey !== idempotencyKey) {
    throw new ApprovalValidationError('Idempotency key mismatch — this approval has already been processed or is stale', 'IDEMPOTENCY_MISMATCH');
  }
  if (!workflow.toolName) throw new ApprovalValidationError('Workflow has no tool to execute', 'INVALID_DRAFT');
  const tool = assertAgentToolAllowed(workflow.toolName, ctx.role);
  assertDraftStillSane(workflow);
  return { workflow, tool };
}

/**
 * The only function that actually runs a write tool. `transition(..., 'EXECUTING')` is called
 * BEFORE the tool runs — if two approve requests raced (they can't in this single-threaded/
 * synchronous-I/O demo, but the guard costs nothing and documents the intent), the second one's
 * `transition` call would throw `InvalidWorkflowTransitionError` because the workflow is no
 * longer in WAITING_APPROVAL, independent of the idempotency-key check above.
 */
export async function approveAndExecute(workflowId: string, ctx: UserContext, idempotencyKey: string): Promise<AgentWorkflow> {
  const { workflow, tool } = validateApproval(workflowId, ctx, idempotencyKey);
  transition(workflowId, 'EXECUTING');
  try {
    const result = await tool.execute(ctx, workflow.preview);
    return transition(workflowId, 'COMPLETED', { result });
  } catch (err) {
    return transition(workflowId, 'FAILED', { error: err instanceof Error ? err.message : String(err) });
  }
}

export function cancelWorkflow(workflowId: string, ctx: UserContext): AgentWorkflow {
  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new ApprovalValidationError('Workflow not found', 'NOT_FOUND');
  assertOwnedBy(workflow, ctx);
  return transition(workflowId, 'CANCELLED');
}
