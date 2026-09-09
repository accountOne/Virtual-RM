import { Request, Response } from 'express';
import { adminService } from '../services/admin.service';

export const adminController = {
  updateCustomer(req: Request, res: Response) {
    res.json(adminService.updateCustomer(req.body));
  },
  replaceAccounts(req: Request, res: Response) {
    res.json(adminService.replaceAccounts(req.body));
  },
  updateAccount(req: Request, res: Response) {
    const updated = adminService.updateAccount(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json(updated);
  },
  updateTransaction(req: Request, res: Response) {
    const updated = adminService.updateTransaction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
    res.json(updated);
  },
  updateTask(req: Request, res: Response) {
    const updated = adminService.updateTask(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy việc cần làm' });
    res.json(updated);
  },
  updateAlert(req: Request, res: Response) {
    const updated = adminService.updateAlert(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy cảnh báo' });
    res.json(updated);
  },
  updateProduct(req: Request, res: Response) {
    const updated = adminService.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json(updated);
  },
  updateRecommendation(req: Request, res: Response) {
    const updated = adminService.updateRecommendation(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy gợi ý' });
    res.json(updated);
  },
  reset(_req: Request, res: Response) {
    adminService.resetAll();
    res.json({ message: 'Đã khôi phục dữ liệu demo gốc' });
  },
};
