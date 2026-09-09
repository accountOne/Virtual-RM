import { Request, Response } from 'express';
import { productsService } from '../services/products.service';

export const productsController = {
  list(_req: Request, res: Response) {
    res.json(productsService.list());
  },
};
