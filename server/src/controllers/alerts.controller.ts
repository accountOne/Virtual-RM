import { Request, Response } from 'express';
import { alertsService } from '../services/alerts.service';

export const alertsController = {
  list(_req: Request, res: Response) {
    res.json(alertsService.list());
  },
};
