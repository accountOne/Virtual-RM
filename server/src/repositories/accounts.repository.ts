import { JsonFileRepository } from './json-file.repository';
import { Account } from '../models';

export const accountsRepository = new JsonFileRepository<Account>('accounts.json');
