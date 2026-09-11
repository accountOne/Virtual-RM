import { CommonModule, Location } from '@angular/common';
import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SidebarComponent } from '../../../../shared/components/sidebar/sidebar.component';
import { RmChatSessionService } from '../../interaction/rm-chat-session.service';
import { RMAction } from '../../interaction/rm-interaction.types';
import { RmMessageComponent } from '../../components/rm-message/rm-message.component';
import { RmTypingComponent } from '../../components/rm-typing/rm-typing.component';

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

/**
 * Full-screen Virtual RM chat (UI redesign, replaces the old popup/bottom-sheet widget
 * entirely). `position: fixed; inset: 0` so it covers the standard app header/sidebar chrome
 * without needing to restructure app.component.html's shell per route — the same trick a modal
 * takeover uses. Its own header re-uses `app-sidebar` locally (own open/close state) so the
 * hamburger can still reach the rest of the app.
 *
 * Conversation state lives in `RmChatSessionService` (see that file's doc comment) — this page
 * is a thin view over it, same as the retired `RmChatComponent` was.
 */
@Component({
  selector: 'app-virtual-rm-chat-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, RmMessageComponent, RmTypingComponent],
  template: `
    <div class="fixed inset-0 z-50 bg-white flex">
      <!-- app-sidebar is "lg:static" (a normal permanent column at desktop widths, an overlay
           drawer below that) — same row layout app.component.html itself uses, so it must be a
           sibling of the content column below, not a flex-col child alongside the header. -->
      <app-sidebar [open]="sidebarOpen()" (close)="sidebarOpen.set(false)" />

      <div class="flex-1 min-w-0 flex flex-col h-full">
      <!-- Header — brand-700→900 gradient (the same MSB brand palette used everywhere else in
           the app, just its darkest steps), matching the reference mockup's dedicated
           full-screen chat header instead of the standard white MSB Business Banking bar. -->
      <header
        class="shrink-0 bg-gradient-to-br from-brand-700 to-brand-900 text-white px-4 py-3.5 flex items-center gap-3"
        style="padding-top: max(0.875rem, env(safe-area-inset-top))"
      >
        <button class="p-1.5 -ml-1 rounded-lg hover:bg-white/10 shrink-0" (click)="sidebarOpen.set(true)" aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <div class="flex-1 min-w-0">
          <p class="font-semibold leading-tight truncate">Virtual RM</p>
          <p class="text-[11px] text-white/70 truncate">Đồng hành cùng doanh nghiệp của bạn</p>
        </div>
        <button class="p-1.5 rounded-lg hover:bg-white/10 shrink-0" (click)="router.navigateByUrl('/virtual-rm')" aria-label="Thông báo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <div class="relative shrink-0">
          <div class="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-lg">👩‍💼</div>
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-positive ring-2 ring-brand-800"></span>
        </div>
        <!-- Collapses the full-screen chat back to wherever the customer tapped the floating
             bubble from — Location.back() reuses that browser-history entry; falling back to
             the dashboard only covers a direct deep-link with no prior in-app page. -->
        <button class="p-1.5 rounded-lg hover:bg-white/10 shrink-0" (click)="close()" aria-label="Đóng">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>

      <!-- Message list -->
      <div #scrollEl class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3.5 max-w-xl w-full mx-auto">
        <app-rm-message
          *ngFor="let msg of messages()"
          [message]="msg"
          (actionClick)="handleAction($event)"
          (quickReply)="ask($event)"
        />
        <app-rm-typing *ngIf="busy()" [state]="rmState()" />

        <ng-container *ngIf="!hasUserAsked()">
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

      <div class="px-4 pb-1 shrink-0 max-w-xl w-full mx-auto" *ngIf="hasUserAsked()">
        <button class="text-[11px] text-ink-400 hover:text-ink-600" (click)="resetChat()">↺ Bắt đầu cuộc trò chuyện mới</button>
      </div>

      <!-- Input bar — a "more" menu icon and a (visual-only; Speech-to-Text is out of scope,
           see docs/phase-5.6-evaluation.md) mic icon flank the text field, per the mockup. -->
      <form
        class="p-3 border-t border-ink-100 flex items-center gap-2 shrink-0 max-w-xl w-full mx-auto"
        style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
        (ngSubmit)="submit()"
      >
        <button type="button" class="p-2 text-ink-400 hover:text-ink-600 shrink-0" aria-label="Thêm" (click)="sidebarOpen.set(true)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button type="button" class="p-2 text-ink-400 shrink-0 cursor-default" aria-label="Nhập giọng nói (chưa hỗ trợ)" title="Nhập giọng nói — chưa hỗ trợ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <input
          [(ngModel)]="draft"
          name="draft"
          type="text"
          placeholder="Nhập nội dung cần hỗ trợ"
          class="flex-1 min-w-0 rounded-full border border-ink-200 px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
        />
        <button
          type="submit"
          class="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40"
          [disabled]="!draft.trim() || busy()"
          aria-label="Gửi"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </form>
      </div>
    </div>
  `,
})
export class VirtualRmChatPageComponent {
  readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly session = inject(RmChatSessionService);

  @ViewChild('scrollEl') scrollEl?: ElementRef<HTMLDivElement>;

  readonly suggested = SUGGESTED_QUESTIONS;
  readonly quickNav = [
    { icon: '📄', label: 'LC', link: '/trade-finance/lc' },
    { icon: '🛡️', label: 'Bảo lãnh', link: '/trade-finance/guarantees' },
    { icon: '📥', label: 'Nhờ thu', link: '/trade-finance/collections' },
    { icon: '📊', label: 'Trade Finance', link: '/trade-finance' },
  ];
  readonly sidebarOpen = signal(false);

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

  /** Collapses the full-screen page back to wherever the customer opened it from — the
   * floating bubble launcher (`RmChatLauncherComponent`) pushes this route onto the existing
   * browser history, so going back reuses that entry rather than navigating "somewhere new". A
   * direct deep-link with no prior in-app page falls back to the dashboard instead of leaving
   * the app. */
  close(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigateByUrl('/dashboard');
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
    if (action.type === 'NAVIGATE' && action.route) this.goTo(action.route);
  }

  goTo(link: string): void {
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
