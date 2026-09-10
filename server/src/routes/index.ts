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

apiRouter.put('/admin/customer', adminController.updateCustomer);
apiRouter.put('/admin/accounts', adminController.replaceAccounts);
apiRouter.put('/admin/accounts/:id', adminController.updateAccount);
apiRouter.put('/admin/transactions/:id', adminController.updateTransaction);
apiRouter.put('/admin/tasks/:id', adminController.updateTask);
apiRouter.put('/admin/alerts/:id', adminController.updateAlert);
apiRouter.put('/admin/products/:id', adminController.updateProduct);
apiRouter.put('/admin/recommendations/:id', adminController.updateRecommendation);
apiRouter.post('/admin/reset', adminController.reset);
