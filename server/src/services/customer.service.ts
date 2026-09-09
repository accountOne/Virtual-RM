import { customerRepository } from '../repositories';
import { Customer } from '../models';

export const customerService = {
  get(): Customer {
    return customerRepository.read();
  },
  update(patch: Partial<Customer>): Customer {
    return customerRepository.update(patch);
  },
};
