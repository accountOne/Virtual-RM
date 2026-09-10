import { Request, Response } from 'express';
import {
  answerQuery,
  buildSecurityContext,
  businessBriefing,
  getIntentDef,
  getNavigationActions,
  tradeFinanceBriefing,
} from '../semantic/semantic-engine';
import { buildQuery } from '../semantic/query-builder';
import { generateAnswer } from '../semantic/response-generator';
import { getAnchorDates } from '../services/transactions.service';
import { ClarificationResult, SemanticQueryResult } from '../semantic/types';
import { loadAiConfig } from '../ai/ai-client';
import { routeQuery } from '../ai/model-router';
import { runReasoning } from '../ai/reasoning-engine';
import { toUserContext } from '../ai/types';
import { getConversationContext, resolveCurrencyFollowUp, resolveDocumentFollowUp, setConversationContext } from '../ai/conversation-context';
import { stripDiacritics } from '../semantic/normalizer';

/** "Cho tôi business briefing hôm nay." (spec §27 demo scenario #15) is a request for the
 * *standing* daily summary, not a question to route through intent detection — same as how
 * GET /api/virtual-rm/briefing already bypasses it (see semantic-engine.ts's own comment on
 * businessBriefing()). Recognized here so it also works typed into the chat, not just via the
 * dedicated endpoint. */
function isBriefingRequest(message: string): boolean {
  const normalized = stripDiacritics(message.toLowerCase());
  return ['business briefing', 'briefing hom nay', 'tong quan hom nay', 'bao cao hom nay'].some((p) => normalized.includes(p));
}

/** Phase 6 — same idea as isBriefingRequest above, scoped to Trade Finance. Checked *before*
 * isBriefingRequest in query() below since "trade finance briefing hôm nay" would otherwise
 * also match isBriefingRequest's broader "briefing hom nay" substring. */
function isTradeFinanceBriefingRequest(message: string): boolean {
  const normalized = stripDiacritics(message.toLowerCase());
  return ['trade finance briefing', 'briefing trade finance', 'bao cao trade finance'].some((p) => normalized.includes(p));
}

/** SEMANTIC_DEBUG=true surfaces matchedTerms/entities/filters in the response — useful during
 * the demo/dev, not meant for a production UI (see business-semantics/README.md §28). */
function debugEnabled(): boolean {
  return process.env.SEMANTIC_DEBUG === 'true';
}

export const semanticController = {
  /** POST /api/virtual-rm/query — { message } -> SemanticQueryResult | ClarificationResult.
   * userId/role are read from the request body because this demo has no server-side session
   * (the API is intentionally unauthenticated); companyId is never taken from the client — see
   * semantic-engine.ts::buildSecurityContext.
   *
   * Phase 5 (AI Reasoning) adds two things on top of the existing deterministic pipeline,
   * both additive — a plain simple-query request behaves exactly as before:
   *   1. A short currency-only follow-up ("Còn tài khoản USD?") replays the previous turn's
   *      intent with the new currency, via conversation-context.ts, bypassing intent
   *      detection entirely for that one turn.
   *   2. The resolved intent (or, for a couple of cross-domain questions the 50-intent pack
   *      has no intent for at all, the raw message) is run through the Model Router; if it
   *      needs reasoning, the Reasoning Engine's answer replaces the deterministic one and
   *      `semantic.reasoningRequired` is set to true.
   */
  async query(req: Request, res: Response) {
    const { message, userId, role } = req.body as { message?: string; userId?: string; role?: 'MAKER' | 'CHECKER' | 'ADMIN' };
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi' });
    }
    const security = buildSecurityContext(userId, role);
    const debug = debugEnabled();
    const config = loadAiConfig();

    // ---- Typed-in-chat Trade Finance briefing request (Phase 6) — checked before the plain
    // business-briefing trigger below since it would otherwise also match it. --------------
    if (isTradeFinanceBriefingRequest(message)) {
      setConversationContext(security.userId, { lastIntent: 'TRADE_FINANCE_BRIEFING' });
      return res.json(tradeFinanceBriefing(security));
    }

    // ---- Typed-in-chat business briefing request ------------------------------------------
    if (isBriefingRequest(message)) {
      setConversationContext(security.userId, { lastIntent: 'BUSINESS_BRIEFING' });
      return res.json(businessBriefing(security));
    }

    // ---- Multi-turn LC/Guarantee document-number follow-up (Phase 6, spec §45) -----------
    const docFollowUp = resolveDocumentFollowUp(message, security.userId);
    if (docFollowUp) {
      const intentDef = getIntentDef(docFollowUp.intent);
      if (intentDef) {
        const anchorToday = getAnchorDates().today;
        const query = buildQuery({ intent: intentDef, confidence: 1, entities: { documentId: docFollowUp.documentId }, security, matchedTerms: [] });
        const answer = generateAnswer({ query, anchorToday, navigationActions: getNavigationActions() });
        setConversationContext(security.userId, { lastIntent: docFollowUp.intent });
        const result: SemanticQueryResult = {
          success: true,
          semantic: { intent: docFollowUp.intent, confidence: 1, ...(debug ? { entities: query.entities, filters: query.filters } : {}) },
          answer,
        };
        return res.json(result);
      }
    }

    // ---- Multi-turn currency follow-up (spec §17) ----------------------------------------
    const followUp = resolveCurrencyFollowUp(message, security.userId);
    if (followUp) {
      const intentDef = getIntentDef(followUp.intent);
      if (intentDef) {
        const anchorToday = getAnchorDates().today;
        const query = buildQuery({ intent: intentDef, confidence: 1, entities: {}, security, matchedTerms: [] });
        query.filters.currency = followUp.currency;
        const answer = generateAnswer({ query, anchorToday, navigationActions: getNavigationActions() });
        setConversationContext(security.userId, { lastIntent: followUp.intent, lastCurrency: followUp.currency });
        const result: SemanticQueryResult = {
          success: true,
          semantic: { intent: followUp.intent, confidence: 1, ...(debug ? { entities: query.entities, filters: query.filters } : {}) },
          answer,
        };
        return res.json(result);
      }
    }

    const result = answerQuery(message, security, { debug });

    // ---- Model Router: does this need the Reasoning Engine? ------------------------------
    const resolvedIntent = result.semantic.intent === 'CLARIFICATION_NEEDED' ? undefined : result.semantic.intent;
    const routing = routeQuery(message, resolvedIntent, config);

    if (!routing.reasoningRequired || !routing.useCase) {
      if (resolvedIntent) setConversationContext(security.userId, { lastIntent: resolvedIntent });
      return res.json(result);
    }

    const anchorToday = getAnchorDates().today;
    const reasoning = await runReasoning({
      useCase: routing.useCase,
      security: toUserContext(security),
      anchorToday,
      navigationActions: getNavigationActions(),
      config,
      companyName: undefined,
    });

    setConversationContext(security.userId, { lastIntent: routing.useCase });

    // Keep the confidence the 50-intent engine already computed when one exists (it already
    // cleared the confidence threshold to get here); pure-keyword-triggered use cases (no
    // underlying 50-intent — e.g. LIQUIDITY_ANALYSIS) get 1, matching a deterministic rule
    // firing rather than a fuzzy score.
    const baseConfidence = 'confidence' in result.semantic ? result.semantic.confidence : 1;
    const withReasoning: SemanticQueryResult = {
      success: true,
      semantic: {
        intent: routing.useCase,
        confidence: resolvedIntent ? baseConfidence : 1,
        reasoningRequired: true,
        ...(debug ? { reasoning: reasoning.debug } : {}),
      },
      answer: reasoning.answer,
    };
    res.json(withReasoning);
  },

  /** GET /api/virtual-rm/briefing — BUSINESS_BRIEFING, callable directly without going through
   * intent detection (see business-semantics spec §23). */
  briefing(req: Request, res: Response) {
    const { userId, role } = req.query as { userId?: string; role?: 'MAKER' | 'CHECKER' | 'ADMIN' };
    const security = buildSecurityContext(userId, role);
    res.json(businessBriefing(security));
  },

  /** GET /api/virtual-rm/trade-finance-briefing — Phase 6, same pattern as briefing() above. */
  tradeFinanceBriefing(req: Request, res: Response) {
    const { userId, role } = req.query as { userId?: string; role?: 'MAKER' | 'CHECKER' | 'ADMIN' };
    const security = buildSecurityContext(userId, role);
    res.json(tradeFinanceBriefing(security));
  },
};

// Re-exported so tests can inspect a raw ClarificationResult shape without importing
// semantic/types directly in every test file.
export type { ClarificationResult };
