import { Request, Response } from 'express';
import { rmService } from '../services/rm.service';

export const rmController = {
  briefing(_req: Request, res: Response) {
    res.json(rmService.getBriefing());
  },

  query(req: Request, res: Response) {
    const { question } = req.body as { question?: string };
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ message: 'Thiếu nội dung câu hỏi' });
    }
    res.json(rmService.answerQuery(question));
  },
};
