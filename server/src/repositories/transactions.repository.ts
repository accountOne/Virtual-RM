import { JsonFileRepository } from './json-file.repository';
import { Transaction } from '../models';

export const transactionsRepository = new JsonFileRepository<Transaction>('transactions.json');
