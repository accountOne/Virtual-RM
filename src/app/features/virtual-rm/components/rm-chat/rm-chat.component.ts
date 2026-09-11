import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatUiService } from '../../../../core/services/chat-ui.service';
import { DailyDashboardService } from '../../../../core/services/daily-dashboard.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { RmContextService } from '../../interaction/rm-context.service';
import { RMAction, RMMessage } from '../../interaction/rm-interaction.types';
import { buildProactiveGreeting, buildRmMessages } from '../../interaction/rm-message-builder';
import { RmStateService } from '../../interaction/rm-state.service';
import { RmStreamService } from '../../interaction/rm-stream.service';
import { RmTimingService } from '../../interaction/rm-timing.service';
import { RmMessageComponent } from '../rm-message/rm-message.component';
import { RmTypingComponent } from '../rm-typing/rm-typing.component';

// Phase 5 (AI Reasoning) quick actions (spec §25) up front, each a full natural-language
// question so it routes correctly through the Model Router — the emoji is just a visual
// prefix on the chip, not a separate control.
const SUGGESTED_QUESTIONS = [
  '📊 Dòng tiền tháng này thế nào?',
  '💰 Có đủ tiền trả các khoản sắp tới không?',
  '✍️ Tôi cần xử lý việc gì quan trọng nhất hôm nay?',
  '💡 Sản phẩm nào phù hợp với dòng tiền hiện tại?',
  'Số dư hiện tại?',
  'Tôi muốn chuyển tiền',
  'Phê duyệt giao dịch',
  'Giao dịch lớn nhất?',
  'Khoản vay sắp đến hạn?',
  'Tỷ giá USD hôm nay?',
  // Phase 6 (Trade Finance) quick actions — same idea, natural-language so they route
  // through the Model Router's Trade Finance rules (see server/src/ai/model-router.ts).
  '📄 LC nào rủi ro cao nhất?',
  '🏦 Bảo lãnh nào cần chú ý?',
  '💱 Tổng exposure Trade Finance?',
  '📰 Trade Finance briefing hôm nay',
];

/** Phase 7 — direct-navigate shortcuts (open the dedicated screen immediately, not a chat
 * question) so Virtual RM behaves as an RM embedded into Business Banking, not a standalone
 * chatbot the user must ask their way through to reach a real screen. */
const QUICK_NAV = [
  { icon: '📄', label: 'LC', link: '/trade-finance/lc' },
  { icon: '🛡️', label: 'Bảo lãnh', link: '/trade-finance/guarantees' },
  { icon: '📥', label: 'Nhờ thu', link: '/trade-finance/collections' },
  { icon: '📊', label: 'Trade Finance', link: '/trade-finance' },
];

// Phase 5.6 — bumped from `vrm_chat_messages` because the stored shape changed from flat
// `ChatMessage` (`text`/`ctas`) to rich `RMMessage` (`type`/`content`/`metrics`/...); reusing the
// old key would either crash on read or silently mis-render old sessions.
const CHAT_STORAGE_KEY = 'vrm_chat_messages_v2';

let idCounter = 0;
function localId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-local-${idCounter}`;
}

@Component({
  selector: 'app-rm-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RmMessageComponent, RmTypingComponent],
  template: `
    <div class="flex flex-col h-full min-h-0">
      <div #scrollEl class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
        <app-rm-message
          *ngFor="let msg of messages()"
          [message]="msg"
          (actionClick)="handleAction($event)"
          (quickReply)="ask($event)"
        />
        <app-rm-typing *ngIf="busy()" [state]="rmState()" />

        <!-- Scrolls with the messages (not a fixed-height sibling below) so a growing
             chip list can never push the input form out of the sheet's fixed-height,
             overflow-hidden container on mobile — see rm-widget.component.ts's h-[50dvh]. -->
        <ng-container *ngIf="!hasUserAsked()">
          <!-- Direct-navigate shortcuts: open the dedicated screen right away, not a chat
               question — Virtual RM as an RM embedded into Business Banking, not a chatbot
               that stands in for the real screens. -->
          <div class="flex gap-1.5 flex-wrap">
            <button
              *ngFor="let n of quickNav"
              (click)="goTo(n.link)"
              class="text-xs px-2.5 py-1.5 rounded-full border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            >
              {{ n.icon }} {{ n.label }}
            </button>
          </div>
          <div class="flex gap-1.5 flex-wrap">
            <button
              *ngFor="let q of suggested"
              (click)="ask(q)"
              class="text-xs px-2.5 py-1.5 rounded-full bg-ink-50 text-ink-600 hover:bg-ink-100 transition-colors"
            >
              {{ q }}
            </button>
          </div>
        </ng-container>
      </div>

      <div class="px-4 pb-1 shrink-0" *ngIf="hasUserAsked()">
        <button class="text-[11px] text-ink-400 hover:text-ink-600" (click)="resetChat()">↺ Bắt đầu cuộc trò chuyện mới</button>
      </div>

      <form class="p-3 border-t border-ink-100 flex gap-2 shrink-0" (ngSubmit)="submit()">
        <input
          [(ngModel)]="draft"
          name="draft"
          type="text"
          placeholder="Hỏi Virtual RM..."
          class="flex-1 min-w-0 rounded-lg border border-ink-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
        />
        <button type="submit" class="btn-primary" [disabled]="!draft.trim() || busy()">Gửi</button>
      </form>
    </div>
  `,
})
export class RmChatComponent {
  private readonly rmData = inject(RmDataService);
  private readonly dailyDashboard = inject(DailyDashboardService);
  private readonly router = inject(Router);
  private readonly chatUi = inject(ChatUiService);
  private readonly context = inject(RmContextService);
  private readonly rmState_ = inject(RmStateService);
  private readonly timing = inject(RmTimingService);
  private readonly stream = inject(RmStreamService);

  @ViewChild('scrollEl') scrollEl?: ElementRef<HTMLDivElement>;

  readonly suggested = SUGGESTED_QUESTIONS;
  readonly quickNav = QUICK_NAV;
  readonly messages = signal<RMMessage[]>([]);
  readonly busy = signal(false);
  readonly hasUserAsked = computed(() => this.messages().some((m) => m.from === 'USER'));
  readonly rmState = this.rmState_.state;
  draft = '';

  /** True only while this instance is still showing the plain fallback greeting and hasn't yet
   * been upgraded to the proactive one — guards the one-time upgrade effect below so it never
   * re-fires or clobbers a conversation the customer has already started. */
  private awaitingProactiveUpgrade = false;

  constructor() {
    const restored = restoreMessages();
    if (restored && restored.length > 0) {
      this.messages.set(restored);
      this.scrollToBottom();
    } else if (this.dailyDashboard.loaded()) {
      void this.showProactiveGreeting();
    } else {
      this.messages.set([this.fallbackGreetingMessage()]);
      this.awaitingProactiveUpgrade = true;
      effect(() => {
        if (this.awaitingProactiveUpgrade && this.dailyDashboard.loaded()) {
          this.awaitingProactiveUpgrade = false;
          void this.showProactiveGreeting();
        }
      });
    }
  }

  private fallbackGreetingMessage(): RMMessage {
    const customer = this.rmData.customer();
    const content =
      this.rmData.briefing()?.greeting ??
      `Chào anh/chị${customer ? ', ' + customer.companyName : ''} 👋 Tôi là Virtual RM của doanh nghiệp. Anh/chị cần tôi hỗ trợ gì?`;
    return { id: localId('greet'), from: 'RM', type: 'TEXT', content, timestamp: Date.now() };
  }

  /** Phase 5.6 Proactive RM (Flow 6) — replaces the single static greeting with a lively,
   * progressively-revealed multi-bubble opener built from the real Daily Dashboard data. */
  private async showProactiveGreeting(): Promise<void> {
    const dashboard = this.dailyDashboard.dashboard();
    if (!dashboard) {
      this.messages.set([this.fallbackGreetingMessage()]);
      persistMessages(this.messages());
      return;
    }
    this.messages.set([]);
    this.rmState_.set('GREETING');
    await this.stream.reveal(buildProactiveGreeting(dashboard), (msg) => {
      this.messages.update((list) => [...list, msg]);
      persistMessages(this.messages());
      this.scrollToBottom();
    });
    this.rmState_.set('IDLE');
  }

  ask(question: string): void {
    this.draft = question;
    this.submit();
  }

  async submit(): Promise<void> {
    const question = this.draft.trim();
    if (!question || this.busy()) return;
    this.draft = '';
    this.pushMessage({ id: localId('user'), from: 'USER', type: 'TEXT', content: question, timestamp: Date.now() });
    this.busy.set(true);
    this.rmState_.set('PROCESSING');
    const start = performance.now();
    try {
      // Phase 5.6 context-awareness (spec §15): a short follow-up like "Còn thiếu gì?" is
      // enriched with the current screen's entity id before it's sent — the customer never
      // sees or types that id themselves.
      const enriched = this.context.enrichWithContext(question);
      const raw = await this.rmData.askRmRaw(enriched);
      this.rmState_.set('ANALYZING');
      await this.timing.settle(performance.now() - start);
      this.rmState_.set('RESPONDING');
      const rmMessages = buildRmMessages(raw.answer);
      await this.stream.reveal(rmMessages, (msg) => this.pushMessage(msg));
    } catch {
      this.pushMessage({
        id: localId('error'),
        from: 'RM',
        type: 'TEXT',
        content: 'Xin lỗi, hệ thống đang gặp sự cố. Anh/chị thử lại sau ít phút nhé.',
        timestamp: Date.now(),
      });
    } finally {
      this.busy.set(false);
      this.rmState_.set('IDLE');
      this.scrollToBottom();
    }
  }

  handleAction(action: RMAction): void {
    if (action.type === 'NAVIGATE' && action.route) {
      this.goTo(action.route);
    }
  }

  goTo(link: string): void {
    this.chatUi.closeAll();
    this.router.navigateByUrl(link);
  }

  resetChat(): void {
    this.awaitingProactiveUpgrade = false;
    if (this.dailyDashboard.loaded()) {
      void this.showProactiveGreeting();
    } else {
      this.messages.set([this.fallbackGreetingMessage()]);
      persistMessages(this.messages());
    }
  }

  private pushMessage(msg: RMMessage): void {
    this.messages.update((list) => [...list, msg]);
    persistMessages(this.messages());
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scrollEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}

function isRmMessageArray(value: unknown): value is RMMessage[] {
  return Array.isArray(value) && value.every((m) => m && typeof m === 'object' && 'type' in m && 'from' in m);
}

function restoreMessages(): RMMessage[] | null {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isRmMessageArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistMessages(messages: RMMessage[]): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore — chat just won't survive a reload
  }
}
