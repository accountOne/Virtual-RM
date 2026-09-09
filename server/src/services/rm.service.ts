import { customerService } from './customer.service';
import { accountsService } from './accounts.service';
import { transactionsService, getAnchorDates } from './transactions.service';
import { tasksService } from './tasks.service';
import { alertsService } from './alerts.service';
import { recommendationsService } from './recommendations.service';
import { rmMessagesRepository } from '../repositories';
import { detectIntent, Intent } from '../rules/intent-engine';
import { formatVnd, formatShortVnd } from '../utils/currency.util';

export interface Briefing {
  greeting: string;
  companyName: string;
  rmName: string;
  todayLabel: string;
  balance: number;
  balanceShort: string;
  incomingYesterday: number;
  outgoingYesterday: number;
  pendingApprovalCount: number;
  pendingApprovalAmount: number;
  tasksOpenCount: number;
  alertsCount: number;
  insight: { message: string; pctChange: number };
}

export interface RmAnswer {
  intent: Intent;
  message: string;
  cta?: { label: string; link: string };
  data?: unknown;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

/** Reference FX rates — kept in sync with the static table shown on the /fx page. */
const FX_RATES = {
  USD: { buy: 25180, sell: 25480 },
  EUR: { buy: 27050, sell: 27480 },
};

export const rmService = {
  getBriefing(): Briefing {
    const customer = customerService.get();
    const { today } = getAnchorDates();
    const yesterdaySummary = transactionsService.yesterdaySummary();
    const pending = transactionsService.pendingApproval();
    const openTasks = tasksService.open();
    const alerts = alertsService.list();
    const insight = transactionsService.weeklySpendInsight();
    const balance = accountsService.totalBalance();

    const insightMessage =
      insight.baselineAvgWeek > 0
        ? `Chi phí thanh toán tuần này ${insight.pctChange >= 0 ? 'tăng' : 'giảm'} ${Math.abs(Math.round(insight.pctChange))}% so với mức trung bình 4 tuần gần nhất.`
        : 'Chưa đủ dữ liệu lịch sử để so sánh chi phí tuần này.';

    return {
      greeting: buildGreeting(customer.companyName, openTasks.length, pending.length),
      companyName: customer.companyName,
      rmName: customer.rmName,
      todayLabel: today,
      balance,
      balanceShort: formatShortVnd(balance),
      incomingYesterday: yesterdaySummary.incoming,
      outgoingYesterday: yesterdaySummary.outgoing,
      pendingApprovalCount: pending.length,
      pendingApprovalAmount: pending.reduce((s, t) => s + t.amount, 0),
      tasksOpenCount: openTasks.length,
      alertsCount: alerts.length,
      insight: { message: insightMessage, pctChange: Math.round(insight.pctChange) },
    };
  },

  answerQuery(question: string): RmAnswer {
    const { intent, period } = detectIntent(question);

    switch (intent) {
      case 'BALANCE': {
        const accounts = accountsService.list();
        const main = accounts[0];
        if (!main) return unknownAnswer();
        return {
          intent,
          message: `Số dư tài khoản ${main.accountName} hiện tại là ${formatVnd(main.balance)}, số dư khả dụng ${formatVnd(main.availableBalance)}.`,
          cta: { label: 'Xem tài khoản', link: '/accounts' },
          data: accounts,
        };
      }

      case 'TRANSACTION_SUMMARY': {
        const summary = transactionsService.yesterdaySummary();
        const largest = transactionsService.largestYesterday();
        let message = `Hôm qua doanh nghiệp đã thực hiện ${summary.count} giao dịch, tổng giá trị chi ra là ${formatVnd(summary.outgoing)}.`;
        if (largest) {
          message += ` Giao dịch lớn nhất là ${formatVnd(largest.amount)} với ${largest.counterparty}.`;
        }
        return { intent, message, cta: { label: 'Xem giao dịch', link: '/accounts' }, data: { summary, largest } };
      }

      case 'LARGEST_TRANSACTION': {
        const largest = transactionsService.largestYesterday();
        if (!largest) {
          return { intent, message: 'Hôm qua doanh nghiệp không có giao dịch chi nào.', cta: { label: 'Xem giao dịch', link: '/accounts' } };
        }
        return {
          intent,
          message: `Giao dịch lớn nhất hôm qua là ${formatVnd(largest.amount)} với ${largest.counterparty} (${largest.description}).`,
          cta: { label: 'Xem giao dịch', link: '/accounts' },
          data: largest,
        };
      }

      case 'PENDING_APPROVAL': {
        const pending = transactionsService.pendingApproval();
        if (pending.length === 0) {
          return { intent, message: 'Hiện không có giao dịch nào đang chờ phê duyệt.', cta: { label: 'Xem giao dịch', link: '/payments/approval' } };
        }
        const total = pending.reduce((s, t) => s + t.amount, 0);
        return {
          intent,
          message: `Hiện có ${pending.length} giao dịch đang chờ phê duyệt, tổng giá trị ${formatVnd(total)}.`,
          cta: { label: 'Kiểm tra ngay', link: '/payments/approval' },
          data: pending,
        };
      }

      case 'INCOMING_PAYMENT': {
        if (period === 'MONTH') {
          const total = transactionsService.monthToDateIncoming();
          return {
            intent,
            message: `Tháng này doanh nghiệp đã nhận tổng cộng ${formatVnd(total)}.`,
            cta: { label: 'Xem tài khoản', link: '/accounts' },
          };
        }
        const summary = transactionsService.yesterdaySummary();
        return {
          intent,
          message: `Hôm qua doanh nghiệp đã nhận ${formatVnd(summary.incoming)} từ ${summary.count} giao dịch.`,
          cta: { label: 'Xem tài khoản', link: '/accounts' },
        };
      }

      case 'OUTGOING_PAYMENT': {
        const summary = transactionsService.yesterdaySummary();
        return {
          intent,
          message: `Hôm qua doanh nghiệp đã chi ${formatVnd(summary.outgoing)}.`,
          cta: { label: 'Xem tài khoản', link: '/accounts' },
        };
      }

      case 'ACCOUNT': {
        const accounts = accountsService.list();
        const message = `Doanh nghiệp hiện có ${accounts.length} tài khoản: ${accounts
          .map((a) => `${a.accountName} (${formatVnd(a.balance)})`)
          .join(', ')}.`;
        return { intent, message, cta: { label: 'Xem tài khoản', link: '/accounts' }, data: accounts };
      }

      case 'TASK': {
        const open = tasksService.open();
        if (open.length === 0) {
          return { intent, message: 'Anh/chị không còn việc nào cần xử lý. Rất tốt!', cta: { label: 'Xem việc cần làm', link: '/virtual-rm' } };
        }
        const message = `Anh/chị còn ${open.length} việc cần xử lý: ${open.map((t) => t.title).join('; ')}.`;
        return { intent, message, cta: { label: open[0].actionLabel, link: open[0].actionLink }, data: open };
      }

      case 'PRODUCT': {
        const active = recommendationsService.listActive();
        if (active.length === 0) {
          return { intent, message: 'Hiện tại chưa có gợi ý sản phẩm nào phù hợp, tôi sẽ cập nhật khi có thông tin mới.', cta: { label: 'Xem sản phẩm', link: '/products' } };
        }
        const message = `Dựa trên hoạt động của doanh nghiệp, tôi gợi ý: ${active.map((r) => r.title).join(', ')}.`;
        return { intent, message, cta: { label: 'Xem giải pháp', link: '/products' }, data: active };
      }

      case 'GREETING': {
        const customer = customerService.get();
        return {
          intent,
          message: `Chào anh/chị${customer ? ', ' + customer.companyName : ''} 👋 Tôi là Virtual RM, sẵn sàng hỗ trợ doanh nghiệp. Anh/chị cần tôi giúp gì hôm nay?`,
        };
      }

      case 'THANKS': {
        return { intent, message: 'Rất vui được hỗ trợ anh/chị. Nếu cần thêm thông tin gì, cứ hỏi tôi bất cứ lúc nào nhé!' };
      }

      case 'HELP': {
        const messages = rmMessagesRepository.read();
        return {
          intent,
          message:
            'Tôi có thể giúp anh/chị: xem số dư và giao dịch, kiểm tra và xử lý phê duyệt, theo dõi việc cần làm, tra cứu thông tin doanh nghiệp/khoản vay/hợp đồng, và gợi ý sản phẩm phù hợp. Anh/chị có thể hỏi theo gợi ý bên dưới.',
          data: { suggestedQuestions: messages.suggestedQuestions },
        };
      }

      case 'LOAN': {
        const loanAlert = alertsService.list().find((a) => /vay/i.test(a.title) || /vay/i.test(a.description));
        if (loanAlert) {
          return {
            intent,
            message: `${loanAlert.title}. ${loanAlert.description}`,
            cta: { label: 'Xem khoản vay', link: '/loans' },
            data: loanAlert,
          };
        }
        return {
          intent,
          message: 'Hiện doanh nghiệp không có khoản vay nào cần chú ý. Anh/chị có thể xem chi tiết hạn mức tín dụng tại trang Khoản vay.',
          cta: { label: 'Xem khoản vay', link: '/loans' },
        };
      }

      case 'FX_RATE': {
        return {
          intent,
          message: `Tỷ giá tham khảo hôm nay: USD ${formatVnd(FX_RATES.USD.buy)} mua vào / ${formatVnd(FX_RATES.USD.sell)} bán ra; EUR ${formatVnd(FX_RATES.EUR.buy)} / ${formatVnd(FX_RATES.EUR.sell)}. Xem đầy đủ tại trang FX Business.`,
          cta: { label: 'Xem giải pháp FX', link: '/fx' },
          data: FX_RATES,
        };
      }

      case 'CONTRACT': {
        const contractTask = tasksService.list().find((t) => /hợp đồng/i.test(t.title) || /hợp đồng/i.test(t.description));
        if (contractTask && contractTask.status === 'OPEN') {
          return {
            intent,
            message: `${contractTask.title}: ${contractTask.description} (hạn ${contractTask.dueDate}).`,
            cta: { label: 'Ký hợp đồng', link: '/contracts/sign' },
            data: contractTask,
          };
        }
        return {
          intent,
          message: 'Hiện không có hợp đồng nào đang chờ ký. Tôi sẽ báo ngay khi có hợp đồng mới cần xử lý.',
          cta: { label: 'Xem hợp đồng', link: '/contracts/sign' },
        };
      }

      case 'COMPANY_INFO': {
        const customer = customerService.get();
        return {
          intent,
          message: `${customer.companyName} (Mã KH: ${customer.customerId}) — Ngành: ${customer.industry}, Quy mô: ${customer.companySize}, Phân khúc: ${customer.segment}. Chuyên viên quan hệ khách hàng: ${customer.rmName} (${customer.rmContact}).`,
          cta: { label: 'Xem hồ sơ doanh nghiệp', link: '/company/profile' },
          data: customer,
        };
      }

      case 'ALERT': {
        const alerts = alertsService.list();
        if (alerts.length === 0) {
          return { intent, message: 'Hiện không có cảnh báo nào cần chú ý.', cta: { label: 'Xem Virtual RM', link: '/virtual-rm' } };
        }
        const message = `Anh/chị có ${alerts.length} cảnh báo cần chú ý: ${alerts.map((a) => a.title).join('; ')}.`;
        return { intent, message, cta: { label: alerts[0].actionLabel, link: alerts[0].actionLink }, data: alerts };
      }

      case 'TRANSFER': {
        return {
          intent,
          message: 'Anh/chị có thể lập lệnh chuyển tiền ngay tại đây — chọn tài khoản nguồn, nhập người thụ hưởng và số tiền là xong.',
          cta: { label: 'Chuyển tiền ngay', link: '/payments/single-transfer' },
        };
      }

      case 'BATCH_TRANSFER': {
        return {
          intent,
          message: 'Anh/chị có thể tải lên danh sách chi lương hoặc thanh toán nhà cung cấp hàng loạt tại đây.',
          cta: { label: 'Chuyển tiền hàng loạt', link: '/payments/batch-transfer' },
        };
      }

      case 'REPORTS': {
        return {
          intent,
          message: 'Anh/chị có thể xem báo cáo dòng tiền theo danh mục và các số liệu tổng hợp tại trang Báo cáo.',
          cta: { label: 'Xem báo cáo', link: '/reports' },
        };
      }

      case 'DASHBOARD': {
        return {
          intent,
          message: 'Đưa anh/chị về trang tổng quan ngay đây.',
          cta: { label: 'Về Dashboard', link: '/dashboard' },
        };
      }

      default:
        return unknownAnswer();
    }
  },
};

function buildGreeting(companyName: string, openTaskCount: number, pendingCount: number): string {
  const parts = [`Chào anh/chị, ${companyName} 👋`];
  if (pendingCount > 0 || openTaskCount > 0) {
    const bits: string[] = [];
    if (pendingCount > 0) bits.push(`${pendingCount} giao dịch đang chờ phê duyệt`);
    if (openTaskCount > 0) bits.push(`${openTaskCount} việc cần xử lý`);
    parts.push(`Hôm nay doanh nghiệp có ${bits.join(' và ')}. Tôi có thể giúp anh/chị xử lý nhanh.`);
  } else {
    parts.push('Hôm nay mọi việc đều ổn định, không có việc gì cần gấp.');
  }
  return parts.join(' ');
}

function unknownAnswer(): RmAnswer {
  const messages = rmMessagesRepository.read();
  const message = pickRandom(messages.fallback) ?? 'Xin lỗi, tôi chưa hiểu rõ câu hỏi. Anh/chị có thể hỏi theo gợi ý bên dưới.';
  return { intent: 'UNKNOWN', message, data: { suggestedQuestions: messages.suggestedQuestions } };
}
