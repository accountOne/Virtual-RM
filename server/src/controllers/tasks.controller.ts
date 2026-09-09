import { Request, Response } from 'express';
import { tasksService } from '../services/tasks.service';

export const tasksController = {
  list(_req: Request, res: Response) {
    res.json(tasksService.list());
  },

  complete(req: Request, res: Response) {
    const updated = tasksService.complete(req.params.id);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy việc cần làm' });
    res.json(updated);
  },
};
