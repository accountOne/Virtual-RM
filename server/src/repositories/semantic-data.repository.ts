import { JsonFileRepository } from './json-file.repository';
import {
  ApprovalRecord,
  BankGuarantee,
  Collection,
  CreditLimit,
  FxDeal,
  FxRate,
  LetterOfCredit,
  Loan,
  Payable,
  PaymentOrder,
  Payroll,
  Receivable,
} from '../models';

/** Supporting datasets for the Business Banking Semantic Pack (see /business-semantics).
 * Grouped in one file since each is a thin JsonFileRepository with no extra behavior. */
export const paymentOrdersRepository = new JsonFileRepository<PaymentOrder>('payment-orders.json');
export const approvalsRepository = new JsonFileRepository<ApprovalRecord>('approvals.json');
export const payrollsRepository = new JsonFileRepository<Payroll>('payrolls.json');
export const fxDealsRepository = new JsonFileRepository<FxDeal>('fx-deals.json');
export const letterOfCreditsRepository = new JsonFileRepository<LetterOfCredit>('letter-of-credits.json');
export const bankGuaranteesRepository = new JsonFileRepository<BankGuarantee>('bank-guarantees.json');
export const collectionsRepository = new JsonFileRepository<Collection>('collections.json');
export const loansRepository = new JsonFileRepository<Loan>('loans.json');
export const creditLimitsRepository = new JsonFileRepository<CreditLimit>('credit-limits.json');
export const receivablesRepository = new JsonFileRepository<Receivable>('receivables.json');
export const payablesRepository = new JsonFileRepository<Payable>('payables.json');

/** fx-rates.json is a plain array with no `id` field (rows are keyed by currency),
 * so it's read directly rather than through JsonFileRepository<T extends { id?: string }>. */
import fs from 'fs';
import path from 'path';

const FX_RATES_PATH = path.join(__dirname, '..', '..', 'data', 'fx-rates.json');

export const fxRatesRepository = {
  readAll(): FxRate[] {
    return JSON.parse(fs.readFileSync(FX_RATES_PATH, 'utf-8')) as FxRate[];
  },
};
