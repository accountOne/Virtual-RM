import { Request, Response } from 'express';
import { customerService } from '../services/customer.service';

export const customerController = {
  get(_req: Request, res: Response) {
    res.json(customerService.get());
  },
};
