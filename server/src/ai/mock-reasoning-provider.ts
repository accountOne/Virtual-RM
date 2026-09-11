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

  // ---- Trade Finance (Phase 6) --------------------------------------------------------
  LC_RISK_PRIORITIZATION: (f) => {
    const count = f.count as number;
    const highCount = f.highCount as number;
    const topLcNumber = f.topLcNumber as string | undefined;
    const topReasons = f.topReasons as string[];
    return {
      title: 'Ưu tiên xử lý LC',
      summary:
        count === 0
          ? 'Hiện không có LC nào đang theo dõi.'
          : `${count} LC đang theo dõi, ${highCount} ở mức rủi ro cao. LC cần xử lý trước: ${topLcNumber ?? '—'}.`,
      insights: topReasons && topReasons.length > 0 ? [`${topLcNumber}: ${topReasons.join('; ')}.`] : [],
    };
  },

  GUARANTEE_RISK_PRIORITIZATION: (f) => {
    const count = f.count as number;
    const highCount = f.highCount as number;
    const topBgNumber = f.topBgNumber as string | undefined;
    const topReasons = f.topReasons as string[];
    return {
      title: 'Ưu tiên xử lý bảo lãnh',
      summary:
        count === 0
          ? 'Hiện không có bảo lãnh nào đang theo dõi.'
          : `${count} bảo lãnh đang theo dõi, ${highCount} ở mức rủi ro cao. Bảo lãnh cần xử lý trước: ${topBgNumber ?? '—'}.`,
      insights: topReasons && topReasons.length > 0 ? [`${topBgNumber}: ${topReasons.join('; ')}.`] : [],
    };
  },

  TRADE_FINANCE_EXPOSURE: (f) => {
    const totalExposure = f.totalExposure as string;
    const lcExposure = f.lcExposure as string;
    const guaranteeExposure = f.guaranteeExposure as string;
    const collectionExposure = f.collectionExposure as string;
    return {
      title: 'Exposure Trade Finance',
      summary: `Tổng exposure Trade Finance: ${totalExposure}.`,
      insights: [`LC: ${lcExposure}. Bảo lãnh: ${guaranteeExposure}. Nhờ thu: ${collectionExposure}.`],
    };
  },

  TRADE_FINANCE_LIMIT_ANALYSIS: (f) => {
    const totalLimit = f.totalLimit as string;
    const usedAmount = f.usedAmount as string;
    const availableAmount = f.availableAmount as string;
    const utilization = f.utilization as number;
    return {
      title: 'Hạn mức Trade Finance',
      summary: `Hạn mức Trade Finance: ${totalLimit}, đã dùng ${usedAmount} (${utilization}%), còn khả dụng ${availableAmount}.`,
      insights: [utilization >= 80 ? 'Tỷ lệ sử dụng hạn mức đang ở mức cao — nên theo dõi sát các giao dịch phát sinh mới.' : 'Hạn mức còn dư địa sử dụng.'],
      recommendation:
        utilization >= 80
          ? { title: 'Theo dõi hạn mức Trade Finance', description: 'Cân nhắc rà soát các LC/bảo lãnh sắp phát hành hoặc đề nghị nâng hạn mức.' }
          : undefined,
    };
  },

  TRADE_FINANCE_OVERVIEW: (f) => {
    const activeLcs = f.activeLcs as number;
    const activeGuarantees = f.activeGuarantees as number;
    const openCollections = f.openCollections as number;
    const totalExposure = f.totalExposure as string;
    const utilization = f.utilization as number | undefined;
    return {
      title: 'Tổng quan Trade Finance',
      summary: `Đang có ${activeLcs} LC, ${activeGuarantees} bảo lãnh hiệu lực, ${openCollections} bộ nhờ thu đang xử lý. Tổng exposure: ${totalExposure}.`,
      insights: utilization === undefined ? [] : [`Hạn mức Trade Finance đang sử dụng ${utilization}%.`],
    };
  },

  TRADE_FINANCE_ATTENTION: (f) => {
    const count = f.count as number;
    const highCount = f.highCount as number;
    return {
      title: 'Trade Finance cần chú ý hôm nay',
      summary:
        count === 0
          ? 'Hiện không có LC, bảo lãnh hay nhờ thu nào cần chú ý đặc biệt hôm nay.'
          : `${count} việc Trade Finance cần chú ý hôm nay, trong đó ${highCount} ở mức ưu tiên cao.`,
      insights: [],
    };
  },

  // ---- Phase 5.5 ------------------------------------------------------------------------
  CASHFLOW_DIAGNOSTIC: (f) => {
    const decreased = f.decreased as boolean;
    const unchanged = f.unchanged as boolean;
    const variance = f.variance as string;
    const variancePct = f.variancePct as string;
    const topDrivers = f.topDrivers as string[];
    return {
      title: unchanged ? 'Dòng tiền không đổi đáng kể' : decreased ? 'Nguyên nhân dòng tiền giảm' : 'Nguyên nhân dòng tiền tăng',
      summary: unchanged
        ? 'Dòng tiền kỳ này gần như không đổi so với kỳ trước.'
        : `Dòng tiền kỳ này ${decreased ? 'giảm' : 'tăng'} ${variance} (${variancePct}) so với kỳ trước.`,
      // Spec §5 DIAGNOSTIC: never an unsupported causal claim ("Chắc chắn vì...") — always
      // phrased as an observation over the available data.
      insights:
        topDrivers.length > 0
          ? [`Nguyên nhân chính theo dữ liệu hiện có là: ${topDrivers.join('; ')}.`]
          : ['Chưa đủ dữ liệu giao dịch để xác định nguyên nhân cụ thể.'],
    };
  },

  DAILY_PRIORITY: (f) => {
    const count = f.count as number;
    const top3Labels = f.top3Labels as string[];
    return {
      title: 'Việc quan trọng nhất hôm nay',
      summary:
        count === 0
          ? 'Hiện không có việc gì cần ưu tiên xử lý đặc biệt hôm nay.'
          : `Có ${count} việc đang cần chú ý trên toàn bộ nghiệp vụ. 3 việc quan trọng nhất: ${top3Labels.join('; ')}.`,
      insights: [],
    };
  },
};
