import { customerRepository } from './customer.repository';
import { accountsRepository } from './accounts.repository';
import { transactionsRepository } from './transactions.repository';
import { tasksRepository } from './tasks.repository';
import { alertsRepository } from './alerts.repository';
import { productsRepository } from './products.repository';
import { recommendationsRepository } from './recommendations.repository';
import { rmMessagesRepository } from './rm-messages.repository';
import {
  approvalsRepository,
  bankGuaranteesRepository,
  collectionsRepository,
  creditLimitsRepository,
  fxDealsRepository,
  letterOfCreditsRepository,
  loansRepository,
  payablesRepository,
  paymentOrdersRepository,
  payrollsRepository,
  receivablesRepository,
} from './semantic-data.repository';

export * from './customer.repository';
export * from './accounts.repository';
export * from './transactions.repository';
export * from './tasks.repository';
export * from './alerts.repository';
export * from './products.repository';
export * from './recommendations.repository';
export * from './rm-messages.repository';
export * from './semantic-data.repository';

/** All repositories that support reset-to-seed, used by the admin "Reset Demo Data" action.
 * fx-rates.json is intentionally excluded — it's static reference data with no admin edit
 * path, not user-mutated demo state. */
export const resettableRepositories = [
  customerRepository,
  accountsRepository,
  transactionsRepository,
  tasksRepository,
  alertsRepository,
  productsRepository,
  recommendationsRepository,
  rmMessagesRepository,
  paymentOrdersRepository,
  approvalsRepository,
  payrollsRepository,
  fxDealsRepository,
  letterOfCreditsRepository,
  bankGuaranteesRepository,
  collectionsRepository,
  loansRepository,
  creditLimitsRepository,
  receivablesRepository,
  payablesRepository,
];
