import { Request, Response } from 'express';
import { buildFootprint, FootprintPeriod, FootprintScope } from '../services/footprint.service';
import { getAnchorDates } from '../services/transactions.service';

const VALID_PERIODS: FootprintPeriod[] = ['year', 'quarter', 'month'];

export const footprintController = {
  get(req: Request, res: Response) {
    const scopeParam = req.query.scope;
    const periodParam = req.query.period;
    const scope: FootprintScope = scopeParam === 'business' ? 'business' : 'personal';
    const period: FootprintPeriod = VALID_PERIODS.includes(periodParam as FootprintPeriod) ? (periodParam as FootprintPeriod) : 'year';

    const { today } = getAnchorDates();
    const footprint = buildFootprint(scope, req.session!.userId, today, period);
    res.json(footprint);
  },
};
