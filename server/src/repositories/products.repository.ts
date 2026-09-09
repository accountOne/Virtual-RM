import { JsonFileRepository } from './json-file.repository';
import { Product } from '../models';

export const productsRepository = new JsonFileRepository<Product>('products.json');
