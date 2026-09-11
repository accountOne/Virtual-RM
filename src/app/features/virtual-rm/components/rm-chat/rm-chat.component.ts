import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatUiService } from '../../../../core/services/chat-ui.service';
import { RmChatSessionService } from '../../interaction/rm-chat-session.service';
import { RMAction } from '../../interaction/rm-interaction.types';
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

/**
 * Thin view over `RmChatSessionService` — the actual conversation (messages, busy, RM state)
 * lives in that singleton, not here, because `rm-widget.component.ts` mounts THIS component
 * twice at once (desktop panel + mobile sheet). See the service's doc comment for the bug that
 * caused when state used to live on the component instead.
 */
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
  private readonly router = inject(Router);
  private readonly chatUi = inject(ChatUiService);
  private readonly session = inject(RmChatSessionService);

  @ViewChild('scrollEl') scrollEl?: ElementRef<HTMLDivElement>;

  readonly suggested = SUGGESTED_QUESTIONS;
  readonly quickNav = QUICK_NAV;
  readonly messages = this.session.messages;
  readonly busy = this.session.busy;
  readonly hasUserAsked = this.session.hasUserAsked;
  readonly rmState = this.session.state;
  draft = '';

  constructor() {
    effect(() => {
      this.messages();
      this.scrollToBottom();
    });
  }

  ask(question: string): void {
    this.draft = '';
    this.session.ask(question);
  }

  async submit(): Promise<void> {
    const question = this.draft.trim();
    if (!question) return;
    this.draft = '';
    await this.session.submit(question);
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
    this.session.resetChat();
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scrollEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
