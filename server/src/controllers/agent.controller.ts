import { Request, Response } from 'express';
// Side-effect import: registers every AgentTool into agent-tool-registry.ts on server boot —
// same "importing the module runs its own registration" pattern tools/index.ts already uses for
// registerReadOnlyTool.
import '../agent/agent-mock-tools';
import { handleMessage } from '../agent/agent-orchestrator';
import { ApprovalValidationError, approveAndExecute, cancelWorkflow } from '../agent/approval-gate';
import { getWorkflow, InvalidWorkflowTransitionError } from '../agent/workflow-engine';
import { toUserContext } from '../ai/types';
import { buildSecurityContext } from '../semantic/semantic-engine';

const MAX_MESSAGE_LENGTH = 2000;

function statusCodeFor(err: unknown): number {
  if (err instanceof ApprovalValidationError) {
    if (err.code === 'NOT_FOUND') return 404;
    if (err.code === 'FORBIDDEN') return 403;
    return 409; // WRONG_STATE / EXPIRED / IDEMPOTENCY_MISMATCH / INVALID_DRAFT — all conflicts, not server errors
  }
  if (err instanceof InvalidWorkflowTransitionError) return 409;
  return 500;
}

export const agentController = {
  /** POST /api/agent/message — { message } -> AgentResponse. Identity from `req.session`, never
   * the request body, same rule every other Virtual RM endpoint in this codebase follows. */
  async message(req: Request, res: Response) {
    const { message } = req.body as { message?: string };
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ status: 'FAILED', message: 'Thiếu nội dung tin nhắn' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ status: 'FAILED', message: 'Tin nhắn quá dài' });
    }
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
    try {
      const response = await handleMessage({ message: message.trim(), security });
      res.json(response);
    } catch (err) {
      // A genuinely unhandled error (bug), not one of handleMessage's normal "expected failure"
      // AgentResponse branches — spec §20's fallback still applies: never crash, never a 500
      // with no guidance for the customer.
      console.error('agent.message.unhandled_error', { message: err instanceof Error ? err.message : String(err) });
      res.status(502).json({ status: 'FAILED', message: 'Hiện tại em chưa thể xử lý yêu cầu này. Anh/chị thử lại sau nhé.' });
    }
  },

  /** POST /api/agent/workflow/:workflowId/approve — { idempotencyKey } -> the completed
   * AgentWorkflow. This is the ONLY endpoint that can turn a WAITING_APPROVAL workflow into a
   * real executed action — see approval-gate.ts's own header comment. */
  async approve(req: Request, res: Response) {
    const { workflowId } = req.params;
    const { idempotencyKey } = req.body as { idempotencyKey?: string };
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({ message: 'Thiếu idempotencyKey' });
    }
    const ctx = toUserContext(buildSecurityContext(req.session!.userId, req.session!.role));
    try {
      const workflow = await approveAndExecute(workflowId, ctx, idempotencyKey);
      res.json(workflow);
    } catch (err) {
      const code = statusCodeFor(err);
      if (code === 500) console.error('agent.approve.unhandled_error', { message: err instanceof Error ? err.message : String(err) });
      res.status(code).json({ message: err instanceof Error ? err.message : 'Không thể xác nhận yêu cầu lúc này.' });
    }
  },

  cancel(req: Request, res: Response) {
    const { workflowId } = req.params;
    const ctx = toUserContext(buildSecurityContext(req.session!.userId, req.session!.role));
    try {
      const workflow = cancelWorkflow(workflowId, ctx);
      res.json(workflow);
    } catch (err) {
      const code = statusCodeFor(err);
      if (code === 500) console.error('agent.cancel.unhandled_error', { message: err instanceof Error ? err.message : String(err) });
      res.status(code).json({ message: err instanceof Error ? err.message : 'Không thể huỷ yêu cầu lúc này.' });
    }
  },

  status(req: Request, res: Response) {
    const { workflowId } = req.params;
    const workflow = getWorkflow(workflowId);
    if (!workflow) return res.status(404).json({ message: 'Không tìm thấy workflow' });
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
    if (workflow.userId !== security.userId) return res.status(403).json({ message: 'Không có quyền xem workflow này' });
    res.json(workflow);
  },
};
