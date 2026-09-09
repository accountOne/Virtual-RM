import { Request, Response } from 'express';
import { recommendationsService } from '../services/recommendations.service';

export const recommendationsController = {
  list(_req: Request, res: Response) {
    res.json(recommendationsService.listActive());
  },
};
