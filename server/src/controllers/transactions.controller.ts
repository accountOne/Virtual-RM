import { Request, Response } from 'express';
import { transactionsService } from '../services/transactions.service';

export const transactionsController = {
  list(req: Request, res: Response) {
    const { accountId, status } = req.query;
    let items = transactionsService.list();
    if (typeof accountId === 'string') items = items.filter((t) => t.accountId === accountId);
    if (typeof status === 'string') items = items.filter((t) => t.status === status);
    res.json(items);
  },

  approve(req: Request, res: Response) {
    const updated = transactionsService.approve(req.params.id);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
    res.json(updated);
  },

  reject(req: Request, res: Response) {
    const updated = transactionsService.reject(req.params.id);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
    res.json(updated);
  },
};
