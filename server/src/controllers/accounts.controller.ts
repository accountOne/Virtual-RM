import { Request, Response } from 'express';
import { accountsService } from '../services/accounts.service';

export const accountsController = {
  list(_req: Request, res: Response) {
    res.json(accountsService.list());
  },
};
