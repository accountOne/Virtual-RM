import { AIProvider, AIRequest, AIResponse, ReasoningRequest, ReasoningResponse } from './types';

/**
 * Deterministic fallback provider — used whenever no real AI_API_KEY is configured (see
 * ai-client.ts). It never calls out to a model: it phrases a Vietnamese RM-style answer
 * from the `facts` object the Reasoning Engine already computed via the Calculation
 * Engine, one template per use case. This is what keeps the no-hallucination policy
 * (spec §21) trivially true for the demo — there's no generative step that could invent a
 * number, only string interpolation of numbers that were already computed deterministically.
 *
 * A real provider (OpenAI/Claude/Azure/...) would receive the exact same `facts` object and
 * could phrase more naturally, but must be under the same constraint: phrase the given
 * facts, never compute new ones — see docs/phase-5-architecture.md.
 */
export class MockReasoningProvider implements AIProvider {
  readonly name = 'mock-deterministic';

  async chat(request: AIRequest): Promise<AIResponse> {
    return { text: request.prompt };
  }

  async reason(request: ReasoningRequest): Promise<ReasoningResponse> {
    const template = TEMPLATES[request.useCase];
    if (!template) {
      return {
        title: 'Phân tích',
        summary: 'Đã thu thập dữ liệu nhưng chưa có mẫu diễn giải cho use case này.',
        insights: [],
      };
    }
    return template(request.facts);
  }
}

type Template = (facts: Record<string, unknown>) => ReasoningResponse;

const TEMPLATES: Record<string, Template> = {
  CASHFLOW_ANALYSIS: (f) => {
    const incoming = f.incoming as string;
    const outgoing = f.outgoing as string;
    const net = f.net as string;
    const trend = f.trend as string;
    return {
      title: `Dòng tiền ${f.periodLabel}`,
      summary: `Tiền vào ${incoming}, tiền ra ${outgoing}, net cashflow ${net}.`,
      insights: [`Dòng tiền đang ${trend}.`],
    };
  },

  LIQUIDITY_ANALYSIS: (f) => {
    const sufficient = f.sufficient as boolean;
    const availableCash = f.availableCash as string;
    const payables = f.payables as string;
    const loanObligations = f.loanObligations as string;
    const projectedCash = f.projectedCash as string;
    return {
      title: 'Khả năng thanh khoản',
      summary: `Số dư khả dụng: ${availableCash}. Nghĩa vụ sắp tới: phải trả ${payables}, trả nợ vay ${loanObligations}. Dự kiến còn ${projectedCash}.`,
      insights: [
        sufficient
          ? 'Hiện tại đủ khả năng đáp ứng nghĩa vụ.'
          : 'Hiện tại có thể thiếu hụt thanh khoản — nên xem xét các khoản thu dự kiến hoặc nguồn bổ sung.',
      ],
    };
  },

  IDLE_CASH_ANALYSIS: (f) => {
    const idleCash = f.idleCash as string;
    const hasIdle = f.hasIdle as boolean;
    return {
      title: 'Phân tích tiền nhàn rỗi',
      summary: hasIdle
        ? `Ước tính ${idleCash} có thể chưa cần sử dụng trong 30 ngày tới.`
        : 'Hiện chưa có khoản tiền nhàn rỗi đáng kể sau khi trừ nghĩa vụ 30 ngày tới.',
      insights: hasIdle ? [`Anh/chị có thể xem xét: tiền gửi kỳ hạn, chứng chỉ tiền gửi, giải pháp quản lý dòng tiền.`] : [],
      recommendation: hasIdle
        ? { title: 'Tối ưu tiền nhàn rỗi', description: 'Xem xét sản phẩm tiền gửi kỳ hạn hoặc chứng chỉ tiền gửi phù hợp.' }
        : undefined,
    };
  },

  PAYMENT_PRIORITIZATION: (f) => {
    const count = f.count as number;
    return {
      title: 'Ưu tiên thanh toán',
      summary: count > 0 ? `${count} lệnh thanh toán cần xử lý, xếp theo mức độ ưu tiên bên dưới.` : 'Hiện không có lệnh thanh toán nào cần ưu tiên.',
      insights: [],
    };
  },

  APPROVAL_PRIORITIZATION: (f) => {
    const count = f.count as number;
    return {
      title: 'Ưu tiên phê duyệt',
      summary: count > 0 ? `${count} giao dịch đang chờ duyệt, xếp theo mức độ ưu tiên bên dưới.` : 'Hiện không có giao dịch nào chờ phê duyệt.',
      insights: [],
    };
  },

  PRODUCT_RECOMMENDATION_REASONING: (f) => {
    const hasIdle = f.hasIdle as boolean;
    const idleCash = f.idleCash as string;
    const productNames = f.productNames as string[];
    return {
      title: 'Gợi ý sản phẩm',
      summary: hasIdle
        ? `Dựa trên dòng tiền hiện tại, doanh nghiệp có khoảng ${idleCash} có khả năng nhàn rỗi trong 30 ngày.`
        : 'Chưa đủ dữ liệu để xác định dòng tiền nhàn rỗi cần tối ưu.',
      insights: [],
      recommendation:
        hasIdle && productNames.length > 0
          ? { title: 'Sản phẩm phù hợp', description: productNames.join(', ') }
          : undefined,
    };
  },
};
