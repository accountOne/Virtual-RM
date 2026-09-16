import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { accountsController } from '../controllers/accounts.controller';
import { transactionsController } from '../controllers/transactions.controller';
import { tasksController } from '../controllers/tasks.controller';
import { alertsController } from '../controllers/alerts.controller';
import { productsController } from '../controllers/products.controller';
import { recommendationsController } from '../controllers/recommendations.controller';
import { rmController } from '../controllers/rm.controller';
import { adminController } from '../controllers/admin.controller';
import { semanticController } from '../controllers/semantic.controller';
import { tradeFinanceController } from '../controllers/trade-finance.controller';
import { authController } from '../controllers/auth.controller';
import { voiceController } from '../controllers/voice.controller';
import { loansController } from '../controllers/loans.controller';
import { footprintController } from '../controllers/footprint.controller';
import { lcAssistController } from '../controllers/lc-assist.controller';
import { agentController } from '../controllers/agent.controller';
import { commandsController } from '../controllers/commands.controller';
import { requireRole } from '../auth/session.middleware';
import { loginRateLimiter, transactionRateLimiter, virtualRmRateLimiter } from '../auth/rate-limit';

export const apiRouter = Router();

// ---- Auth (Login & Session Security upgrade — see docs/security/) -----------------------
// POST /auth/login is the one route reachable without an existing session (app.ts exempts it
// from requireSession/requireCsrf); everything else here runs after those two middlewares.
apiRouter.post('/auth/login', loginRateLimiter, authController.login);
apiRouter.post('/auth/logout', authController.logout);
apiRouter.get('/auth/me', authController.me);
apiRouter.post('/auth/keepalive', authController.keepalive);
apiRouter.get('/auth/sessions', authController.sessions);
apiRouter.post('/auth/sessions/:id/revoke', authController.revoke);
apiRouter.post('/auth/sessions/revoke-all', authController.revokeAll);

apiRouter.get('/customer', customerController.get);
apiRouter.get('/accounts', accountsController.list);
apiRouter.get('/transactions', transactionsController.list);
// Level 5 (spec §15) — approve/reject a payment is an authorization action, restricted to
// CHECKER/ADMIN server-side (previously enforced only by hiding the UI button — see
// docs/security/security-gap-analysis.md §1.2).
apiRouter.post('/transactions/:id/approve', transactionRateLimiter, requireRole('CHECKER', 'ADMIN'), transactionsController.approve);
apiRouter.post('/transactions/:id/reject', transactionRateLimiter, requireRole('CHECKER', 'ADMIN'), transactionsController.reject);
apiRouter.get('/tasks', tasksController.list);
apiRouter.post('/tasks/:id/complete', tasksController.complete);
apiRouter.get('/alerts', alertsController.list);
apiRouter.get('/products', productsController.list);
apiRouter.get('/recommendations', recommendationsController.list);
apiRouter.get('/loans', loansController.list);
apiRouter.get('/rm/briefing', rmController.briefing);
apiRouter.post('/rm/query', rmController.query);

// Voice chat (TTS + STT via OpenAI) — see server/src/voice/openai-voice-client.ts. Reuses the
// Virtual RM query rate limiter: same "authenticated demo user chatting with the RM" traffic
// shape, and these calls cost real money per request so they shouldn't go unlimited either.
apiRouter.post('/voice/speak', virtualRmRateLimiter, voiceController.speak);
apiRouter.post('/voice/transcribe', virtualRmRateLimiter, voiceController.transcribe);

// Business Banking Semantic Pack — see /business-semantics and docs/semantic-engine.md.
// Deterministic, local NLU for the Virtual RM chat; does not replace /rm/query above.
apiRouter.post('/virtual-rm/query', virtualRmRateLimiter, semanticController.query);
apiRouter.get('/virtual-rm/briefing', semanticController.briefing);
apiRouter.get('/virtual-rm/trade-finance-briefing', semanticController.tradeFinanceBriefing);

// Phase 5.5 BRD alignment — Daily Dashboard (docs/phase-5.5-brd-gap-analysis.md §4 item 1).
apiRouter.get('/virtual-rm/daily-dashboard', semanticController.dailyDashboard);

// Phase 5.5 BRD alignment — Dấu ấn (Footprint), see docs/phase-5.5-footprint.md.
apiRouter.get('/virtual-rm/footprint', virtualRmRateLimiter, footprintController.get);

// Phase 5.5 BRD alignment — LC PO-upload assistant (mock extraction — see
// docs/phase-5.5-lc-assistant.md). MAKER/ADMIN only, same as actually creating an LC below —
// this whole flow only ever leads up to that same form.
apiRouter.post('/virtual-rm/lc/analyze-po', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), lcAssistController.analyzePo);
apiRouter.post('/virtual-rm/lc/draft-message', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), lcAssistController.draftMessage);

// Gemini AI Agent — see docs/AI_AGENT_ARCHITECTURE.md. Role checks for write intents happen
// inside agent-orchestrator.ts itself (per-intent, since only some intents write anything), not
// here at the route level — unlike the routes above where every request under a given path is
// uniformly a write.
apiRouter.post('/agent/message', virtualRmRateLimiter, agentController.message);
apiRouter.post('/agent/workflow/:workflowId/approve', transactionRateLimiter, agentController.approve);
apiRouter.post('/agent/workflow/:workflowId/cancel', virtualRmRateLimiter, agentController.cancel);
apiRouter.get('/agent/workflow/:workflowId', virtualRmRateLimiter, agentController.status);

// Maker/Checker BankingCommand — see docs/MAKER_CHECKER_AUDIT.md. Replaces the ad-hoc
// Transaction/PaymentOrder approve/reject path above for NEW commands (that route stays for
// historical/seeded data — see the audit's backward-compatibility plan). Maker routes: MAKER/
// ADMIN only, same "raise != approve" role split trade-finance already uses below. Checker
// routes: CHECKER/ADMIN only; ownership (Maker != Checker) is enforced inside commands.service.ts
// itself since it needs the specific command's makerUserId, not just the caller's role.
apiRouter.post('/commands', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), commandsController.create);
apiRouter.get('/commands', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), commandsController.list);
apiRouter.get('/commands/:id', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), commandsController.get);
apiRouter.post('/commands/:id/validate', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), commandsController.validate);
apiRouter.put('/commands/:id', virtualRmRateLimiter, requireRole('MAKER', 'ADMIN'), commandsController.updateDraft);
apiRouter.post('/commands/:id/submit', transactionRateLimiter, requireRole('MAKER', 'ADMIN'), commandsController.submit);

apiRouter.get('/checker/commands', virtualRmRateLimiter, requireRole('CHECKER', 'ADMIN'), commandsController.checkerList);
apiRouter.get('/checker/commands/:id', virtualRmRateLimiter, requireRole('CHECKER', 'ADMIN'), commandsController.checkerGet);
apiRouter.post('/checker/commands/:id/approve', transactionRateLimiter, requireRole('CHECKER', 'ADMIN'), commandsController.approve);
apiRouter.post('/checker/commands/:id/reject', transactionRateLimiter, requireRole('CHECKER', 'ADMIN'), commandsController.reject);

// Phase 7 — dedicated Trade Finance Business Banking screens (system-of-record REST API,
// separate from the chat query API above; both read the same underlying repositories).
apiRouter.get('/trade-finance/summary', tradeFinanceController.summary);
apiRouter.get('/trade-finance/lc', tradeFinanceController.listLc);
apiRouter.get('/trade-finance/lc/:id', tradeFinanceController.getLc);
// Level 4 (spec §15) — creating an LC/BG/Collection request is a SUBMIT action: MAKER/ADMIN
// only (a CHECKER's job is to approve requests, not raise them — spec §12's role table).
apiRouter.post('/trade-finance/lc', transactionRateLimiter, requireRole('MAKER', 'ADMIN'), tradeFinanceController.createLc);
apiRouter.get('/trade-finance/guarantees', tradeFinanceController.listGuarantees);
apiRouter.get('/trade-finance/guarantees/:id', tradeFinanceController.getGuarantee);
apiRouter.post('/trade-finance/guarantees', transactionRateLimiter, requireRole('MAKER', 'ADMIN'), tradeFinanceController.createGuarantee);
apiRouter.get('/trade-finance/collections', tradeFinanceController.listCollections);
apiRouter.get('/trade-finance/collections/:id', tradeFinanceController.getCollection);
apiRouter.post('/trade-finance/collections', transactionRateLimiter, requireRole('MAKER', 'ADMIN'), tradeFinanceController.createCollection);

// Admin Demo Data Editor — ADMIN only, server-side (previously unauthenticated entirely).
apiRouter.put('/admin/customer', requireRole('ADMIN'), adminController.updateCustomer);
apiRouter.put('/admin/accounts', requireRole('ADMIN'), adminController.replaceAccounts);
apiRouter.put('/admin/accounts/:id', requireRole('ADMIN'), adminController.updateAccount);
apiRouter.put('/admin/transactions/:id', requireRole('ADMIN'), adminController.updateTransaction);
apiRouter.put('/admin/tasks/:id', requireRole('ADMIN'), adminController.updateTask);
apiRouter.put('/admin/alerts/:id', requireRole('ADMIN'), adminController.updateAlert);
apiRouter.put('/admin/products/:id', requireRole('ADMIN'), adminController.updateProduct);
apiRouter.put('/admin/recommendations/:id', requireRole('ADMIN'), adminController.updateRecommendation);
apiRouter.post('/admin/reset', requireRole('ADMIN'), adminController.reset);
