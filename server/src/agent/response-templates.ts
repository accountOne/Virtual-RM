// Vietnamese message templates for AgentResponse.message (spec §16) — plain string
// interpolation from already-known facts, same "phrase, never invent" discipline
// mock-reasoning-provider.ts already uses for the existing Reasoning Engine. No model call here:
// a demo on the Gemini Free Tier shouldn't spend a quota unit just to say "đã chuyển tiền xong".

import { AgentEntities, AgentIntent, EntityField, EntityValue } from './schemas/semantic-understanding.schema';

export function formatAmount(n: number, currency = 'VND'): string {
  return currency === 'VND' ? `${new Intl.NumberFormat('vi-VN').format(n)} đ` : `${currency} ${new Intl.NumberFormat('en-US').format(n)}`;
}
const fmtAmount = formatAmount;

function str(e: EntityValue | undefined): string | undefined {
  return e === undefined ? undefined : String(e.value);
}

const FIELD_LABELS: Partial<Record<EntityField, string>> = {
  amount: 'số tiền',
  beneficiaryName: 'tên người thụ hưởng',
  lcType: 'loại LC (nhập khẩu/xuất khẩu)',
  lcAmount: 'giá trị LC',
  lcCurrency: 'loại tiền LC',
  beneficiary: 'tên người thụ hưởng',
  guaranteeType: 'loại bảo lãnh',
  guaranteeAmount: 'giá trị bảo lãnh',
  collectionType: 'loại nhờ thu',
};

/** spec §8's own example: "Chuyển tiền cho anh Nam" -> "Bạn muốn chuyển bao nhiêu tiền cho anh
 * Nam?" — targeted when there's exactly one missing field and we already know who/what the rest
 * refers to, a combined list otherwise. */
export function buildClarificationQuestion(intent: AgentIntent, missingFields: EntityField[], entities: AgentEntities): string {
  if (missingFields.length === 1) {
    const field = missingFields[0];
    if (intent === 'create_transfer' && field === 'amount') {
      const who = str(entities.beneficiaryName);
      return who ? `Anh/chị muốn chuyển bao nhiêu tiền cho ${who}?` : 'Anh/chị muốn chuyển bao nhiêu tiền ạ?';
    }
    if (intent === 'create_transfer' && field === 'beneficiaryName') {
      return 'Anh/chị muốn chuyển tiền cho ai ạ (tên người/đơn vị thụ hưởng)?';
    }
    return `Anh/chị cho em biết thêm ${FIELD_LABELS[field] ?? field} được không ạ?`;
  }
  const labels = missingFields.map((f) => FIELD_LABELS[f] ?? f).join(', ');
  return `Anh/chị cho em biết thêm: ${labels} nhé.`;
}

/** WAITING_APPROVAL preview message — one line per write intent, always ending with an explicit
 * call for the customer's own confirmation (never implying the system will just go ahead). */
export function buildPreviewMessage(intent: AgentIntent, preview: Record<string, unknown>): string {
  switch (intent) {
    case 'create_transfer': {
      const p = preview as { amount: number; currency: string; beneficiaryName: string };
      return `Em đã chuẩn bị lệnh chuyển ${fmtAmount(p.amount, p.currency)} cho ${p.beneficiaryName}. Anh/chị kiểm tra thông tin và bấm Xác nhận nếu đúng nhé.`;
    }
    case 'create_lc': {
      const p = preview as { amount: number; currency: string; beneficiary: string };
      return `Em đã chuẩn bị yêu cầu mở LC trị giá ${fmtAmount(p.amount, p.currency)} cho ${p.beneficiary}. Anh/chị kiểm tra và bấm Xác nhận nếu đúng nhé.`;
    }
    case 'create_guarantee': {
      const p = preview as { amount: number; currency: string; beneficiary: string };
      return `Em đã chuẩn bị yêu cầu phát hành bảo lãnh trị giá ${fmtAmount(p.amount, p.currency)} cho ${p.beneficiary}. Anh/chị kiểm tra và bấm Xác nhận nếu đúng nhé.`;
    }
    case 'create_collection': {
      const p = preview as { amount: number; currency: string; drawee: string };
      return `Em đã chuẩn bị yêu cầu tạo bộ nhờ thu trị giá ${fmtAmount(p.amount, p.currency)} với ${p.drawee}. Anh/chị kiểm tra và bấm Xác nhận nếu đúng nhé.`;
    }
    default:
      return 'Em đã chuẩn bị yêu cầu, anh/chị kiểm tra và xác nhận nhé.';
  }
}

export function buildCompletionMessage(intent: AgentIntent, result: unknown): string {
  switch (intent) {
    case 'create_transfer': {
      const r = result as { paymentOrderId: string };
      return `Đã tạo lệnh chuyển tiền thành công (mã ${r.paymentOrderId}) — lệnh đang chờ Checker phê duyệt theo đúng quy trình của MSB Business.`;
    }
    case 'create_lc': {
      const r = result as { lcNumber: string };
      return `Đã gửi yêu cầu mở LC ${r.lcNumber} — đang chờ phê duyệt (mô phỏng, không phát hành LC thật).`;
    }
    case 'create_guarantee': {
      const r = result as { bgNumber: string };
      return `Đã gửi yêu cầu phát hành bảo lãnh ${r.bgNumber} — đang chờ phê duyệt (mô phỏng).`;
    }
    case 'create_collection': {
      const r = result as { collectionNumber: string };
      return `Đã tạo bộ nhờ thu ${r.collectionNumber} (mô phỏng).`;
    }
    default:
      return 'Đã hoàn tất yêu cầu của anh/chị.';
  }
}

export function buildFailureMessage(): string {
  return 'Rất tiếc, em chưa thực hiện được yêu cầu này. Anh/chị thử lại hoặc liên hệ RM để được hỗ trợ nhé.';
}

export function buildCancelledMessage(): string {
  return 'Em đã huỷ yêu cầu này. Anh/chị cần hỗ trợ gì thêm không ạ?';
}

export function buildCheckerBlockedMessage(): string {
  // Same wording precedent as trade-finance.controller.ts::createLc's own 403 for a Checker —
  // kept consistent across every place this app tells a Checker "you can only approve, not create".
  return 'Anh/chị đang sử dụng vai trò Checker nên chưa thể tự khởi tạo yêu cầu này. Vui lòng nhờ Maker thực hiện giúp.';
}

export function buildGenericFallbackMessage(): string {
  return 'Hiện tại em chưa thể xử lý yêu cầu này. Anh/chị có thể thử lại sau nhé.';
}
