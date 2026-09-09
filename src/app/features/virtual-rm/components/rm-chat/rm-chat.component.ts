import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatMessage } from '../../../../core/models';
import { ChatUiService } from '../../../../core/services/chat-ui.service';
import { RmDataService } from '../../../../core/services/rm-data.service';

const SUGGESTED_QUESTIONS = [
  'Số dư hiện tại?',
  'Hôm qua chi bao nhiêu?',
  'Giao dịch lớn nhất?',
  'Có giao dịch nào chờ duyệt?',
  'Tôi còn việc gì?',
  'Sản phẩm nào phù hợp?',
  'Thông tin công ty?',
  'Khoản vay sắp đến hạn?',
  'Tỷ giá USD hôm nay?',
];

const CHAT_STORAGE_KEY = 'vrm_chat_messages';

let idCounter = 0;

@Component({
  selector: 'app-rm-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full min-h-0">
      <div #scrollEl class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
        <div *ngFor="let msg of messages()" class="flex" [class.justify-end]="msg.from === 'USER'">
          <div
            class="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
            [ngClass]="
              msg.from === 'USER' ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-ink-50 text-ink-700 rounded-bl-sm'
            "
          >
            <p class="whitespace-pre-line">{{ msg.text }}</p>
            <button
              *ngIf="msg.cta"
              (click)="goTo(msg.cta.link)"
              class="mt-2 text-xs font-semibold underline underline-offset-2"
              [ngClass]="msg.from === 'USER' ? 'text-white' : 'text-brand-600'"
            >
              {{ msg.cta.label }} →
            </button>
          </div>
        </div>
        <div *ngIf="thinking()" class="flex">
          <div class="bg-ink-50 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-ink-400">Virtual RM đang trả lời...</div>
        </div>
      </div>

      <div class="px-4 pb-2 flex gap-1.5 flex-wrap shrink-0" *ngIf="messages().length <= 1">
        <button
          *ngFor="let q of suggested"
          (click)="ask(q)"
          class="text-xs px-2.5 py-1.5 rounded-full bg-ink-50 text-ink-600 hover:bg-ink-100 transition-colors"
        >
          {{ q }}
        </button>
      </div>

      <div class="px-4 pb-1 shrink-0" *ngIf="messages().length > 1">
        <button class="text-[11px] text-ink-400 hover:text-ink-600" (click)="resetChat()">↺ Bắt đầu cuộc trò chuyện mới</button>
      </div>

      <form class="p-3 border-t border-ink-100 flex gap-2 shrink-0" (ngSubmit)="submit()">
        <input
          [(ngModel)]="draft"
          name="draft"
          type="text"
          placeholder="Hỏi Virtual RM..."
          class="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
        />
        <button type="submit" class="btn-primary" [disabled]="!draft.trim() || thinking()">Gửi</button>
      </form>
    </div>
  `,
})
export class RmChatComponent {
  private readonly rmData = inject(RmDataService);
  private readonly router = inject(Router);
  private readonly chatUi = inject(ChatUiService);

  @ViewChild('scrollEl') scrollEl?: ElementRef<HTMLDivElement>;

  readonly suggested = SUGGESTED_QUESTIONS;
  readonly messages = signal<ChatMessage[]>([]);
  readonly thinking = signal(false);
  draft = '';

  constructor() {
    const restored = restoreMessages();
    if (restored && restored.length > 0) {
      this.messages.set(restored);
      this.scrollToBottom();
    } else {
      this.messages.set([{ id: 'greet', from: 'RM', text: this.buildGreeting(), timestamp: Date.now() }]);
    }
  }

  private buildGreeting(): string {
    const customer = this.rmData.customer();
    return (
      this.rmData.briefing()?.greeting ??
      `Chào anh/chị${customer ? ', ' + customer.companyName : ''} 👋 Tôi là Virtual RM của doanh nghiệp. Anh/chị cần tôi hỗ trợ gì?`
    );
  }

  ask(question: string): void {
    this.draft = question;
    this.submit();
  }

  async submit(): Promise<void> {
    const question = this.draft.trim();
    if (!question || this.thinking()) return;
    this.draft = '';
    this.pushMessage({ from: 'USER', text: question });
    this.thinking.set(true);
    try {
      const answer = await this.rmData.askRm(question);
      this.pushMessage({ from: 'RM', text: answer.message, cta: answer.cta });
    } catch {
      this.pushMessage({ from: 'RM', text: 'Xin lỗi, hệ thống đang gặp sự cố. Anh/chị thử lại sau ít phút nhé.' });
    } finally {
      this.thinking.set(false);
      this.scrollToBottom();
    }
  }

  goTo(link: string): void {
    this.chatUi.closeAll();
    this.router.navigateByUrl(link);
  }

  resetChat(): void {
    this.messages.set([{ id: 'greet', from: 'RM', text: this.buildGreeting(), timestamp: Date.now() }]);
    persistMessages(this.messages());
  }

  private pushMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): void {
    this.messages.update((list) => [...list, { ...msg, id: `m${idCounter++}`, timestamp: Date.now() }]);
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

function restoreMessages(): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : null;
  } catch {
    return null;
  }
}

function persistMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore — chat just won't survive a reload
  }
}
