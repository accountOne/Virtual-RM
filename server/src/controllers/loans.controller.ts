import { Request, Response } from 'express';
import { buildSecurityContext } from '../semantic/semantic-engine';
import { getLoans } from '../tools';

export const loansController = {
  list(req: Request, res: Response) {
    const security = buildSecurityContext(req.session!.userId, req.session!.role);
    res.json(getLoans.execute(security, {}));
  },
};
