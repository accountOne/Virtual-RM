import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ChatUiService } from '../../../core/services/chat-ui.service';
import { DailyDashboardService } from '../../../core/services/daily-dashboard.service';
import { RmDataService } from '../../../core/services/rm-data.service';
import { RmContextService } from './rm-context.service';
import { RMMessage } from './rm-interaction.types';
import { buildProactiveGreeting, buildRmMessages } from './rm-message-builder';
import { RmStateService } from './rm-state.service';
import { RmStreamService } from './rm-stream.service';
import { RmTimingService } from './rm-timing.service';

// Bumped from `vrm_chat_messages` because the stored shape changed from flat ChatMessage
// (`text`/`ctas`) to rich RMMessage (`type`/`content`/`metrics`/...); reusing the old key would
// either crash on read or silently mis-render old sessions.
const CHAT_STORAGE_KEY = 'vrm_chat_messages_v2';

let idCounter = 0;
function localId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-local-${idCounter}`;
}

/**
 * Bug fix (post-Phase-5.6 feedback) — `rm-widget.component.ts` renders `RmChatComponent` TWICE
 * at once (desktop `<aside>` panel + mobile bottom sheet, both via the same
 * `*ngTemplateOutlet`, one always CSS-hidden depending on viewport). When conversation state
 * lived on the component itself, that meant two fully independent `messages` signals racing to
 * build the same proactive greeting and both persisting to the same `localStorage` key —
 * confirmed live via Playwright: the two instances ended up with 7 vs. 1 messages after the
 * exact same reveal sequence, because each instance's `RmStreamService` reveal loop runs on its
 * own timers and whichever happened to be slower kept overwriting/being overwritten by the
 * faster one's localStorage writes. That split-brain state is what made CTA clicks and the
 * typing indicator feel inconsistent — the customer could be looking at one instance while an
 * action fired against (or a click landed on) the other.
 *
 * This singleton is now the ONE source of truth both `RmChatComponent` instances render from —
 * there is exactly one conversation, one proactive greeting, one `submit()` in flight,
 * regardless of how many places display it.
 */
@Injectable({ providedIn: 'root' })
export class RmChatSessionService {
  private readonly rmData = inject(RmDataService);
  private readonly dailyDashboard = inject(DailyDashboardService);
  private readonly chatUi = inject(ChatUiService);
  private readonly context = inject(RmContextService);
  private readonly rmState = inject(RmStateService);
  private readonly timing = inject(RmTimingService);
  private readonly stream = inject(RmStreamService);

  readonly messages = signal<RMMessage[]>([]);
  readonly busy = signal(false);
  readonly hasUserAsked = computed(() => this.messages().some((m) => m.from === 'USER'));
  readonly state = this.rmState.state;

  private awaitingProactiveUpgrade = false;
  private greetingStarted = false;

  constructor() {
    const restored = restoreMessages();
    if (restored && restored.length > 0) {
      this.messages.set(restored);
      return;
    }
    if (this.dailyDashboard.loaded()) {
      void this.startProactiveGreeting({ autoOpen: true });
    } else {
      this.messages.set([this.fallbackGreetingMessage()]);
      this.awaitingProactiveUpgrade = true;
      effect(() => {
        if (this.awaitingProactiveUpgrade && this.dailyDashboard.loaded()) {
          this.awaitingProactiveUpgrade = false;
          void this.startProactiveGreeting({ autoOpen: true });
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

  /** Phase 5.6 Proactive RM (Flow 6), now auto-popping the widget open (spec/feedback: "sau
   * login thì RM bật lên chào... theo dạng typing và nổi bubble dạng popup") instead of waiting
   * for the customer to click in — `autoOpen` is false only for the manual "Bắt đầu cuộc trò
   * chuyện mới" reset, which shouldn't re-pop a widget the customer already has open. */
  private async startProactiveGreeting(opts: { autoOpen: boolean }): Promise<void> {
    if (this.greetingStarted) return;
    this.greetingStarted = true;
    if (opts.autoOpen) this.chatUi.openChat();
    const dashboard = this.dailyDashboard.dashboard();
    if (!dashboard) {
      this.messages.set([this.fallbackGreetingMessage()]);
      persistMessages(this.messages());
      return;
    }
    this.messages.set([]);
    this.rmState.set('GREETING');
    await this.stream.reveal(buildProactiveGreeting(dashboard), (msg) => this.pushMessage(msg));
    this.rmState.set('IDLE');
  }

  ask(question: string): void {
    void this.submit(question);
  }

  async submit(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed || this.busy()) return;
    this.pushMessage({ id: localId('user'), from: 'USER', type: 'TEXT', content: trimmed, timestamp: Date.now() });
    this.busy.set(true);
    this.rmState.set('PROCESSING');
    const start = performance.now();
    try {
      // Phase 5.6 context-awareness (spec §15): a short follow-up like "Còn thiếu gì?" is
      // enriched with the current screen's entity id before it's sent — the customer never
      // sees or types that id themselves.
      const enriched = this.context.enrichWithContext(trimmed);
      const raw = await this.rmData.askRmRaw(enriched);
      this.rmState.set('ANALYZING');
      await this.timing.settle(performance.now() - start);
      this.rmState.set('RESPONDING');
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
      this.rmState.set('IDLE');
    }
  }

  resetChat(): void {
    this.awaitingProactiveUpgrade = false;
    this.greetingStarted = false;
    if (this.dailyDashboard.loaded()) {
      void this.startProactiveGreeting({ autoOpen: false });
    } else {
      this.messages.set([this.fallbackGreetingMessage()]);
      persistMessages(this.messages());
    }
  }

  private pushMessage(msg: RMMessage): void {
    this.messages.update((list) => [...list, msg]);
    persistMessages(this.messages());
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
