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

export const apiRouter = Router();

apiRouter.get('/customer', customerController.get);
apiRouter.get('/accounts', accountsController.list);
apiRouter.get('/transactions', transactionsController.list);
apiRouter.post('/transactions/:id/approve', transactionsController.approve);
apiRouter.post('/transactions/:id/reject', transactionsController.reject);
apiRouter.get('/tasks', tasksController.list);
apiRouter.post('/tasks/:id/complete', tasksController.complete);
apiRouter.get('/alerts', alertsController.list);
apiRouter.get('/products', productsController.list);
apiRouter.get('/recommendations', recommendationsController.list);
apiRouter.get('/rm/briefing', rmController.briefing);
apiRouter.post('/rm/query', rmController.query);

// Business Banking Semantic Pack — see /business-semantics and docs/semantic-engine.md.
// Deterministic, local NLU for the Virtual RM chat; does not replace /rm/query above.
apiRouter.post('/virtual-rm/query', semanticController.query);
apiRouter.get('/virtual-rm/briefing', semanticController.briefing);
apiRouter.get('/virtual-rm/trade-finance-briefing', semanticController.tradeFinanceBriefing);

// Phase 7 — dedicated Trade Finance Business Banking screens (system-of-record REST API,
// separate from the chat query API above; both read the same underlying repositories).
apiRouter.get('/trade-finance/summary', tradeFinanceController.summary);
apiRouter.get('/trade-finance/lc', tradeFinanceController.listLc);
apiRouter.get('/trade-finance/lc/:id', tradeFinanceController.getLc);
apiRouter.post('/trade-finance/lc', tradeFinanceController.createLc);
apiRouter.get('/trade-finance/guarantees', tradeFinanceController.listGuarantees);
apiRouter.get('/trade-finance/guarantees/:id', tradeFinanceController.getGuarantee);
apiRouter.post('/trade-finance/guarantees', tradeFinanceController.createGuarantee);
apiRouter.get('/trade-finance/collections', tradeFinanceController.listCollections);
apiRouter.get('/trade-finance/collections/:id', tradeFinanceController.getCollection);
apiRouter.post('/trade-finance/collections', tradeFinanceController.createCollection);

apiRouter.put('/admin/customer', adminController.updateCustomer);
apiRouter.put('/admin/accounts', adminController.replaceAccounts);
apiRouter.put('/admin/accounts/:id', adminController.updateAccount);
apiRouter.put('/admin/transactions/:id', adminController.updateTransaction);
apiRouter.put('/admin/tasks/:id', adminController.updateTask);
apiRouter.put('/admin/alerts/:id', adminController.updateAlert);
apiRouter.put('/admin/products/:id', adminController.updateProduct);
apiRouter.put('/admin/recommendations/:id', adminController.updateRecommendation);
apiRouter.post('/admin/reset', adminController.reset);
