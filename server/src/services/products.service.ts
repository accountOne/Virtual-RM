import { productsRepository } from '../repositories';
import { Product } from '../models';

export const productsService = {
  list(): Product[] {
    return productsRepository.readAll();
  },
  getById(id: string): Product | undefined {
    return productsRepository.findById(id);
  },
};
