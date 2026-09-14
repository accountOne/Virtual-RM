import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface PoExtractedFields {
  type: 'IMPORT' | 'EXPORT';
  subType: 'SIGHT' | 'USANCE';
  beneficiary: string;
  applicant?: string;
  currency: string;
  amount: number;
  latestShipmentDate?: string;
  expiryDate?: string;
  requiredDocuments: string[];
}

export interface PoAnalysisResult {
  templateLabel: string;
  extracted: PoExtractedFields;
  missingFields: (keyof PoExtractedFields)[];
}

export interface LcDraftInput {
  type: string;
  subType: string;
  beneficiary: string;
  applicant: string;
  issuingBank: string;
  advisingBank?: string;
  currency: string;
  amount: number;
  latestShipmentDate: string;
  expiryDate: string;
  requiredDocuments: string[];
}

/** Phase 5.5 BRD alignment — LC PO-upload assistant, see docs/phase-5.5-lc-assistant.md. The
 * uploaded file's bytes are never sent anywhere — only its name/size/type, since the backend
 * doesn't read file content (confirmed mock-extraction design, not real OCR/AI). */
@Injectable({ providedIn: 'root' })
export class LcAssistService {
  private readonly http = inject(HttpClient);

  async analyzePo(file: File): Promise<PoAnalysisResult> {
    return firstValueFrom(
      this.http.post<PoAnalysisResult>('/api/virtual-rm/lc/analyze-po', {
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
      }),
    );
  }

  async draftMessage(input: LcDraftInput): Promise<string> {
    const res = await firstValueFrom(this.http.post<{ message: string }>('/api/virtual-rm/lc/draft-message', input));
    return res.message;
  }
}
