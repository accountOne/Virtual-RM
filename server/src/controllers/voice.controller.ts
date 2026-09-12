import { Request, Response } from 'express';
import { cloudVoiceConfigured, synthesizeSpeech, transcribeSpeech } from '../voice/openai-voice-client';

const MAX_TEXT_LENGTH = 2000;
// Base64 is ~4/3 the size of the raw bytes; this caps a voice note at roughly 8MB of actual
// audio — generous for a chat-length utterance, not for someone trying to upload a large file.
const MAX_AUDIO_BASE64_LENGTH = 11_000_000;

export const voiceController = {
  async speak(req: Request, res: Response) {
    if (!cloudVoiceConfigured()) return res.status(503).json({ message: 'Giọng đọc đám mây chưa được cấu hình', fallback: true });
    const { text } = req.body as { text?: string };
    if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ message: 'Thiếu nội dung cần đọc' });
    if (text.length > MAX_TEXT_LENGTH) return res.status(400).json({ message: 'Nội dung cần đọc quá dài' });
    try {
      const { buffer, mimeType } = await synthesizeSpeech(text.trim());
      res.json({ audioBase64: buffer.toString('base64'), mimeType });
    } catch (err) {
      console.error('Voice TTS error', err);
      res.status(502).json({ message: 'Không thể tạo giọng đọc lúc này', fallback: true });
    }
  },

  async transcribe(req: Request, res: Response) {
    if (!cloudVoiceConfigured()) return res.status(503).json({ message: 'Nhận diện giọng nói đám mây chưa được cấu hình', fallback: true });
    const { audioBase64, mimeType } = req.body as { audioBase64?: string; mimeType?: string };
    if (!audioBase64 || typeof audioBase64 !== 'string') return res.status(400).json({ message: 'Thiếu dữ liệu âm thanh' });
    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) return res.status(400).json({ message: 'Bản ghi âm quá dài' });
    try {
      const buffer = Buffer.from(audioBase64, 'base64');
      const text = await transcribeSpeech(buffer, mimeType || 'audio/webm');
      res.json({ text });
    } catch (err) {
      console.error('Voice STT error', err);
      res.status(502).json({ message: 'Không thể nhận diện giọng nói lúc này', fallback: true });
    }
  },
};
