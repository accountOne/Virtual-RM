import { Request, Response } from 'express';
import { customerRepository } from '../repositories';
import { LcDraftInput, PoExtractedFields, analyzePo, buildLcDraftMessage } from '../services/po-analysis.service';

const MAX_FILE_NAME_LENGTH = 200;
// Content is never read — this only bounds what a client can claim, same spirit as the voice
// controller's MAX_AUDIO_BASE64_LENGTH.
const MAX_FILE_SIZE_BYTES = 20_000_000;
// BRD: hỗ trợ cả 4 định dạng (PDF/ảnh/Word/Excel) — trivial to support all of them since the
// content is never parsed, only the extension is checked.
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];

export const lcAssistController = {
  analyzePo(req: Request, res: Response) {
    const { fileName, fileSizeBytes } = req.body as { fileName?: string; fileSizeBytes?: number };
    if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
      return res.status(400).json({ message: 'Thiếu tên file' });
    }
    if (fileName.length > MAX_FILE_NAME_LENGTH) return res.status(400).json({ message: 'Tên file quá dài' });
    if (typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      return res.status(400).json({ message: 'Thiếu kích thước file' });
    }
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) return res.status(400).json({ message: 'File quá lớn' });
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.toLowerCase().slice(dot) : '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ message: 'Định dạng file không được hỗ trợ (chỉ nhận PDF, ảnh, Word, Excel)' });
    }

    const result = analyzePo(fileName, fileSizeBytes);
    const customer = customerRepository.read();
    const extracted: PoExtractedFields = { ...result.extracted, applicant: customer?.companyName };
    res.json({ ...result, extracted });
  },

  draftMessage(req: Request, res: Response) {
    const body = req.body as Partial<LcDraftInput>;
    if (!body.beneficiary || !body.applicant || !body.amount || !body.currency || !body.issuingBank) {
      return res.status(400).json({ message: 'Thiếu thông tin để tạo bản nháp điện LC' });
    }
    const message = buildLcDraftMessage({
      type: body.type ?? 'IMPORT',
      subType: body.subType ?? 'SIGHT',
      beneficiary: body.beneficiary,
      applicant: body.applicant,
      issuingBank: body.issuingBank,
      advisingBank: body.advisingBank,
      currency: body.currency,
      amount: body.amount,
      latestShipmentDate: body.latestShipmentDate ?? '(chưa xác định)',
      expiryDate: body.expiryDate ?? '(chưa xác định)',
      requiredDocuments: Array.isArray(body.requiredDocuments) ? body.requiredDocuments : [],
    });
    res.json({ message });
  },
};
