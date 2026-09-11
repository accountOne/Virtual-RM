import { Request, Response } from 'express';
import { canCreateLc, tradeFinanceService } from '../services/trade-finance.service';

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
  /** Phase 5.5 BRD alignment §26/§14: LC issuance is a Maker-initiated request — a Checker
   * must never be able to create one, enforced here server-side (never inferred from natural
   * language or trusted from the UI alone, per the BRD's own explicit requirement). `role` is
   * read from the request body only to check it, never used to widen access. */
  createLc(req: Request, res: Response) {
    const { role } = req.body as { role?: 'MAKER' | 'CHECKER' | 'ADMIN' };
    if (!canCreateLc(role)) {
      return res.status(403).json({ message: 'Anh/chị đang sử dụng vai trò Checker. Vui lòng yêu cầu Maker khởi tạo đề nghị phát hành LC.' });
    }
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
