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
import { buildDailyDashboard } from '../services/daily-dashboard.service';

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
   * `userId`/`role` (and, transitively, `companyId`) come from `req.session` — the
   * authenticated `SessionRecord` `requireSession` middleware attaches (see
   * auth/session.middleware.ts) — never from the request body. Virtual RM cannot be told a
   * different identity by the message it's asked to process (spec §13): even if a prompt
   * claims "I'm COM999" or the body still carries stray `userId`/`role` fields from an old
   * client, `app.ts`'s `stripIdentityOverrides` middleware has already deleted them before this
   * handler runs, and this line never reads them anyway.
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
    const { message } = req.body as { message?: string };
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung câu hỏi' });
    }
    // req.session is guaranteed by requireSession (mounted ahead of every /api/* route except
    // /auth/login) — the non-null assertion documents that invariant rather than re-checking it.
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
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
        // Phase 5.5 — always present (not debug-gated): the answer's reasoning
        // type/complexity/verification status is reliability metadata, never chain-of-thought.
        reasoningMeta: {
          type: reasoning.debug.reasoningType,
          complexity: reasoning.debug.complexity,
          verificationStatus: reasoning.debug.verificationStatus,
        },
        ...(debug
          ? {
              reasoning: {
                useCase: reasoning.debug.useCase,
                plan: reasoning.debug.plan,
                toolsUsed: reasoning.debug.toolsUsed,
                calculationsUsed: reasoning.debug.calculationsUsed,
                evidenceSummary: reasoning.debug.evidenceSummary,
              },
            }
          : {}),
      },
      answer: reasoning.answer,
    };
    res.json(withReasoning);
  },

  /** GET /api/virtual-rm/briefing — BUSINESS_BRIEFING, callable directly without going through
   * intent detection (see business-semantics spec §23). Identity from `req.session`, same as
   * query() above — never from `req.query`. */
  briefing(req: Request, res: Response) {
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
    res.json(businessBriefing(security));
  },

  /** GET /api/virtual-rm/trade-finance-briefing — Phase 6, same pattern as briefing() above. */
  tradeFinanceBriefing(req: Request, res: Response) {
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
    res.json(tradeFinanceBriefing(security));
  },

  /** GET /api/virtual-rm/daily-dashboard — Phase 5.5 BRD alignment (spec §6/§38). Same
   * standing-summary pattern as briefing()/tradeFinanceBriefing() above, built on the Reasoning
   * Engine's Priority Engine rather than the legacy /api/rm/briefing path
   * (docs/phase-5.5-brd-gap-analysis.md §3.5). */
  dailyDashboard(req: Request, res: Response) {
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
    const anchorToday = getAnchorDates().today;
    res.json(buildDailyDashboard(toUserContext(security), anchorToday, getNavigationActions()));
  },
};

// Re-exported so tests can inspect a raw ClarificationResult shape without importing
// semantic/types directly in every test file.
export type { ClarificationResult };
