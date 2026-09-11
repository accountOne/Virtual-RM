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
   * must never be able to create one. `requireRole('MAKER', 'ADMIN')` (routes/index.ts) already
   * blocks a Checker's session before this handler ever runs; `canCreateLc(req.session!.role)`
   * here is deliberate defense-in-depth, not the only gate. Login & Session Security upgrade:
   * role now comes from `req.session` (the authenticated session), never `req.body` — a client
   * cannot claim a different role by sending one in the request (and `stripIdentityOverrides`
   * has already deleted any `role` field the body had, before this handler runs). */
  createLc(req: Request, res: Response) {
    if (!canCreateLc(req.session!.role)) {
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
