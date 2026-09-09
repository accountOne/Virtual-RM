import { JsonSingletonRepository } from './json-file.repository';
import { Customer } from '../models';

export const customerRepository = new JsonSingletonRepository<Customer>('customer.json');
