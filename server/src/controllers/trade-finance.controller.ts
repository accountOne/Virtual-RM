import { Request, Response } from 'express';
import { tradeFinanceService } from '../services/trade-finance.service';

export const tradeFinanceController = {
  summary(_req: Request, res: Response) {
    res.json(tradeFinanceService.summary());
  },

  listLc(_req: Request, res: Response) {
    res.json(tradeFinanceService.listLc());
  },
  getLc(req: Request, res: Response) {
    const item = tradeFinanceService.getLc(req.params.id);
    if (!item) return res.status(404).json({ message: 'Không tìm thấy thư tín dụng' });
    res.json(item);
  },
  createLc(req: Request, res: Response) {
    res.status(201).json(tradeFinanceService.createLc(req.body));
  },

  listGuarantees(_req: Request, res: Response) {
    res.json(tradeFinanceService.listGuarantees());
  },
  getGuarantee(req: Request, res: Response) {
    const item = tradeFinanceService.getGuarantee(req.params.id);
    if (!item) return res.status(404).json({ message: 'Không tìm thấy bảo lãnh' });
    res.json(item);
  },
  createGuarantee(req: Request, res: Response) {
    res.status(201).json(tradeFinanceService.createGuarantee(req.body));
  },

  listCollections(_req: Request, res: Response) {
    res.json(tradeFinanceService.listCollections());
  },
  getCollection(req: Request, res: Response) {
    const item = tradeFinanceService.getCollection(req.params.id);
    if (!item) return res.status(404).json({ message: 'Không tìm thấy bộ nhờ thu' });
    res.json(item);
  },
  createCollection(req: Request, res: Response) {
    res.status(201).json(tradeFinanceService.createCollection(req.body));
  },
};
