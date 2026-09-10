import { Request, Response } from 'express';
import { answerQuery, buildSecurityContext, businessBriefing } from '../semantic/semantic-engine';

/** SEMANTIC_DEBUG=true surfaces matchedTerms/entities/filters in the response — useful during
 * the demo/dev, not meant for a production UI (see business-semantics/README.md §28). */
function debugEnabled(): boolean {
  return process.env.SEMANTIC_DEBUG === 'true';
}

export const semanticController = {
  /** POST /api/virtual-rm/query — { message } -> SemanticQueryResult | ClarificationResult.
   * userId/role are read from the request body because this demo has no server-side session
   * (the API is intentionally unauthenticated); companyId is never taken from the client — see
   * semantic-engine.ts::buildSecurityContext. */
  query(req: Request, res: Response) {
    const { message, userId, role } = req.body as { message?: string; userId?: string; role?: 'MAKER' | 'CHECKER' | 'ADMIN' };
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi' });
    }
    const security = buildSecurityContext(userId, role);
    const result = answerQuery(message, security, { debug: debugEnabled() });
    res.json(result);
  },

  /** GET /api/virtual-rm/briefing — BUSINESS_BRIEFING, callable directly without going through
   * intent detection (see business-semantics spec §23). */
  briefing(req: Request, res: Response) {
    const { userId, role } = req.query as { userId?: string; role?: 'MAKER' | 'CHECKER' | 'ADMIN' };
    const security = buildSecurityContext(userId, role);
    res.json(businessBriefing(security));
  },
};
