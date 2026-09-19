import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AgentService, AgentWorkflowRecord } from '../../../core/services/agent.service';
import { AuthService } from '../../../core/services/auth.service';
import { DailyDashboard } from '../../../core/models/daily-dashboard.model';
import { DailyDashboardService } from '../../../core/services/daily-dashboard.service';
import { LcAssistService, PoExtractedFields } from '../../../core/services/lc-assist.service';
import { RmDataService } from '../../../core/services/rm-data.service';
import { RmContextService } from './rm-context.service';
import { RMAction, RMMessage } from './rm-interaction.types';
import { buildAgentMessages, buildDailyBriefingSpokenText, buildProactiveGreeting, buildRmMessages } from './rm-message-builder';
import { RmStateService } from './rm-state.service';
import { RmStreamService } from './rm-stream.service';
import { RmTimingService } from './rm-timing.service';
import { RmVoiceQueueService } from './rm-voice-queue.service';

// LC PO-upload assistant (docs/phase-5.5-lc-assistant.md) — a small set of natural-language
// triggers that start the flow client-side, without teaching the deterministic Semantic Engine
// (94+ well-tested intents) a new one just for this. Deliberately narrow so it never hijacks an
// unrelated LC question ("LC nào sắp hết hạn?" doesn't match).
const LC_ASSIST_TRIGGER = /(mở|phát hành|tạo|làm)\s+(một\s+)?(cái\s+)?lc\b/i;

// Mirrors trade-finance.controller.ts::createLc's 403 message (server/src/controllers/
// trade-finance.controller.ts) — no shared package between the two TS projects, so this is a
// deliberate, narrow duplication kept in sync by hand rather than a needless shared library.
const CHECKER_BLOCKED_MESSAGE = 'Anh/chị đang sử dụng vai trò Checker. Vui lòng yêu cầu Maker khởi tạo đề nghị phát hành LC.';

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
 * Conversation state singleton for the full-screen Virtual RM chat page
 * (`virtual-rm-chat.page.ts`). Originally split out because the old popup widget mounted the
 * chat view TWICE at once (desktop panel + mobile sheet) and component-local state raced across
 * the two instances — confirmed live via Playwright: they ended up with 7 vs. 1 messages after
 * the same reveal sequence. The widget is gone now (UI redesign — see
 * virtual-rm-chat.page.ts), but the singleton stays: it's still the right place for the
 * proactive greeting to start building the moment the Daily Dashboard loads, independent of
 * whether the customer has navigated to the chat page yet (see `app.component.ts`, which
 * injects this eagerly at app root).
 */
@Injectable({ providedIn: 'root' })
export class RmChatSessionService {
  private readonly rmData = inject(RmDataService);
  private readonly dailyDashboard = inject(DailyDashboardService);
  private readonly context = inject(RmContextService);
  private readonly rmState = inject(RmStateService);
  private readonly timing = inject(RmTimingService);
  private readonly stream = inject(RmStreamService);
  private readonly auth = inject(AuthService);
  private readonly lcAssist = inject(LcAssistService);
  private readonly agent = inject(AgentService);
  private readonly voiceQueue = inject(RmVoiceQueueService);

  readonly messages = signal<RMMessage[]>([]);
  readonly busy = signal(false);
  readonly hasUserAsked = computed(() => this.messages().some((m) => m.from === 'USER'));
  /** Unread badge for the floating launcher (UI redesign Phase 5 — see
   * rm-chat-launcher.component.ts) — counts RM messages that arrived after the last time the
   * chat page itself was open. `markAllRead()` is called from the chat page's constructor. */
  private readonly lastReadCount = signal(0);
  readonly unreadCount = computed(() => Math.max(0, this.messages().filter((m) => m.from === 'RM').length - this.lastReadCount()));

  markAllRead(): void {
    this.lastReadCount.set(this.messages().filter((m) => m.from === 'RM').length);
  }
  readonly state = this.rmState.state;
  /** Gemini AI Agent toggle (docs/AI_AGENT_ARCHITECTURE.md) — additive, off by default: the
   * existing deterministic-engine `submit()` path is unchanged and untouched by this signal.
   * When on, free-text input routes to `askAgent()` instead (LC PO-upload's own trigger still
   * takes precedence either way — it does more than the Agent's own create_lc intent). */
  readonly agentMode = signal(false);

  private awaitingProactiveUpgrade = false;
  private greetingStarted = false;
  /** LC PO-upload assistant step tracking — set once the customer has picked Import/Export and
   * cleared once the flow ends (file uploaded, or a normal question interrupts it). */
  private lcAssistType: 'IMPORT' | 'EXPORT' | null = null;

  constructor() {
    // Voice UX upgrade (spec §9/§11) — registered unconditionally, before the restored-history
    // branch below can `return` early: this service is a root singleton constructed ONCE at app
    // bootstrap (see app.component.ts), so on a browser that already has chat history in
    // localStorage from an earlier session, `startProactiveGreeting()` below never runs again on
    // a later login — it would be the wrong place to gate the daily briefing on. Keying off
    // `auth.loginSessionId()` instead (set fresh by AuthService.login() on every explicit login,
    // reused on a mere page refresh) means this correctly re-arms on a genuine new login even
    // when the visible greeting itself doesn't rebuild, and correctly stays silent on
    // refresh/navigate/reopen within the same login (`hasSpokenDailyBriefing()`'s sessionStorage
    // gate, keyed by that same loginSessionId, does the actual dedup).
    effect(() => {
      const dashboard = this.dailyDashboard.dashboard();
      if (dashboard && this.auth.loginSessionId()) this.speakDailyBriefingOnce(dashboard);
    });

    const restored = restoreMessages();
    if (restored && restored.length > 0) {
      this.messages.set(restored);
      return;
    }
    if (this.dailyDashboard.loaded()) {
      void this.startProactiveGreeting();
    } else {
      this.messages.set([this.fallbackGreetingMessage()]);
      this.awaitingProactiveUpgrade = true;
      effect(() => {
        if (this.awaitingProactiveUpgrade && this.dailyDashboard.loaded()) {
          this.awaitingProactiveUpgrade = false;
          void this.startProactiveGreeting();
        }
      });
    }
  }

  private fallbackGreetingMessage(): RMMessage {
    const customer = this.rmData.customer();
    const content =
      this.rmData.briefing()?.greeting ??
      `Chào anh/chị${customer ? ', ' + customer.companyName : ''} 👋 Tôi là Virtual RM của doanh nghiệp. Anh/chị cần tôi hỗ trợ gì?`;
    // Voice UX upgrade — same reasoning as buildProactiveGreeting()'s `silent` bubbles: this
    // generic filler is superseded by the separate spoken daily-briefing summary, not something
    // to read verbatim itself.
    return { id: localId('greet'), from: 'RM', type: 'TEXT', content, timestamp: Date.now(), voice: { enabled: false } };
  }

  /** Phase 5.6 Proactive RM (Flow 6) — builds the multi-bubble greeting from real Daily
   * Dashboard data as soon as it's available, so it's already sitting there the moment the
   * customer opens the full-screen chat page, rather than being built on demand. */
  private async startProactiveGreeting(): Promise<void> {
    if (this.greetingStarted) return;
    this.greetingStarted = true;
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

  /** Voice UX upgrade (spec §9/§11) — the one voice event that fires after login: a short spoken
   * summary, gated to at most once per login session by `RmVoiceQueueService`'s sessionStorage
   * key (survives refresh/navigate/close-reopen-RM, resets on a genuine new login — see
   * auth.service.ts's `loginSessionId`). Spoken directly via the queue rather than through
   * `pushMessage()`, since this is a voice-only event, not a new visible chat bubble (the visible
   * greeting above already covers the same ground on screen). Triggered by the constructor's own
   * `effect()` (keyed off `auth.loginSessionId()` + the dashboard loading) rather than from here,
   * so it still fires on a second/third login even when restored chat history skips rebuilding
   * the visible greeting entirely — see that effect's doc comment. */
  private speakDailyBriefingOnce(dashboard: DailyDashboard): void {
    if (this.voiceQueue.hasSpokenDailyBriefing()) return;
    // Same reasoning as RmVoiceQueueService.enqueueAssistantMessage()'s own ordering (discovered
    // live, via Playwright, testing this exact flow): voice output is off by default, so a
    // customer who logs in and only turns it on a moment later must still get to hear this login
    // session's briefing. Not consuming the once-per-session sessionStorage slot while voice is
    // off means the constructor's `effect()` above (which re-evaluates on every
    // `voice.speechEnabled()` change, since this call chain reads that signal) naturally retries
    // and succeeds the moment the customer enables voice — no extra plumbing needed.
    if (!this.voiceQueue.isEnabled()) return;
    this.voiceQueue.markDailyBriefingSpoken();
    const spokenText = buildDailyBriefingSpokenText(dashboard);
    if (!spokenText) return; // nothing urgent today — correct to stay silent
    this.voiceQueue.enqueueAssistantMessage({
      id: localId('daily-briefing'),
      from: 'RM',
      type: 'ALERT',
      content: spokenText,
      voice: { enabled: true, priority: 'important', spokenText },
      timestamp: Date.now(),
    });
  }

  ask(question: string): void {
    void this.submit(question);
  }

  toggleAgentMode(): void {
    this.agentMode.update((v) => !v);
  }

  async submit(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed || this.busy()) return;
    this.pushMessage({ id: localId('user'), from: 'USER', type: 'TEXT', content: trimmed, timestamp: Date.now() });
    if (LC_ASSIST_TRIGGER.test(trimmed)) {
      await this.beginLcAssist();
      return;
    }
    if (this.agentMode()) {
      await this.submitToAgent(trimmed);
      return;
    }
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

  /** Gemini AI Agent path (spec §0/§16) — POST /api/agent/message. Handles all statuses
   * uniformly: WAITING_APPROVAL renders an approval card (buildAgentMessages), everything else
   * (ANSWERED/NEEDS_CLARIFICATION/COMPLETED/FAILED/CANCELLED) a plain text bubble with the
   * backend's own natural-language message — the server decides what to say, this just displays
   * it. The USER bubble for `question` is already pushed by the caller (submit()). */
  private async submitToAgent(question: string): Promise<void> {
    this.busy.set(true);
    this.rmState.set('PROCESSING');
    try {
      const response = await this.agent.sendMessage(question);
      this.rmState.set('RESPONDING');
      await this.stream.reveal(buildAgentMessages(response), (msg) => this.pushMessage(msg));
    } catch {
      this.pushMessage({
        id: localId('agent-error'),
        from: 'RM',
        type: 'TEXT',
        content: 'Xin lỗi, AI Agent đang gặp sự cố. Anh/chị thử lại sau ít phút nhé.',
        timestamp: Date.now(),
      });
    } finally {
      this.busy.set(false);
      this.rmState.set('IDLE');
    }
  }

  /** Approve/Cancel click on an Agent WAITING_APPROVAL card (RMAction.type 'CONFIRM', payload
   * `{agentAction, workflowId, idempotencyKey?}` — see rm-message-builder.ts::buildAgentMessages
   * and virtual-rm-chat.page.ts::handleAction, which routes here instead of
   * resolveLcAssistChoice() based on the payload shape). */
  async handleAgentAction(payload: { agentAction: 'approve' | 'cancel'; workflowId: string; idempotencyKey?: string }): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.rmState.set('PROCESSING');
    try {
      if (payload.agentAction === 'cancel') {
        await this.agent.cancel(payload.workflowId);
        this.pushMessage({ id: localId('agent-cancelled'), from: 'RM', type: 'TEXT', content: 'Em đã huỷ yêu cầu này. Anh/chị cần hỗ trợ gì thêm không ạ?', timestamp: Date.now() });
        return;
      }
      if (!payload.idempotencyKey) return;
      const workflow = await this.agent.approve(payload.workflowId, payload.idempotencyKey);
      this.pushMessage({ id: localId('agent-result'), from: 'RM', type: 'TEXT', content: buildApprovalResultMessage(workflow), timestamp: Date.now() });
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Không thể xử lý yêu cầu này lúc này. Anh/chị thử lại nhé.';
      this.pushMessage({ id: localId('agent-action-error'), from: 'RM', type: 'TEXT', content: message, timestamp: Date.now() });
    } finally {
      this.busy.set(false);
      this.rmState.set('IDLE');
    }
  }

  /** Chat-page entry chip for the LC PO-upload assistant — pushes the same synthetic user
   * bubble a typed trigger phrase would, so the transcript reads naturally either way. */
  startLcAssist(): void {
    if (this.busy()) return;
    this.pushMessage({
      id: localId('user'),
      from: 'USER',
      type: 'TEXT',
      content: 'Tôi muốn phát hành LC từ đơn hàng (PO)',
      timestamp: Date.now(),
    });
    void this.beginLcAssist();
  }

  /** BRD LC PO-upload flow, step 1: role check, then ask Import/Export. Entirely client-side
   * state (no server-side conversation store) — consistent with this demo's "no server session
   * for business state" convention (see server/src/ai/conversation-context.ts's own doc
   * comment); each backend call below (analyze-po, draft-message) is a plain stateless request. */
  private async beginLcAssist(): Promise<void> {
    const role = this.auth.currentUser()?.role;
    if (role !== 'MAKER' && role !== 'ADMIN') {
      this.pushMessage({ id: localId('lc-blocked'), from: 'RM', type: 'TEXT', content: CHECKER_BLOCKED_MESSAGE, timestamp: Date.now() });
      return;
    }
    this.busy.set(true);
    this.rmState.set('RESPONDING');
    try {
      await this.stream.reveal(
        [
          {
            id: localId('lc-type'),
            from: 'RM',
            type: 'ACTION',
            content: 'Được ạ! Anh/chị muốn mở LC Nhập khẩu hay Xuất khẩu?',
            actions: [
              { label: 'Nhập khẩu (Import)', type: 'CONFIRM', payload: { step: 'lcType', value: 'IMPORT' } },
              { label: 'Xuất khẩu (Export)', type: 'CONFIRM', payload: { step: 'lcType', value: 'EXPORT' } },
            ],
            timestamp: Date.now(),
          },
        ],
        (msg) => this.pushMessage(msg),
      );
    } finally {
      this.busy.set(false);
      this.rmState.set('IDLE');
    }
  }

  /** Handles a click on one of the LC-assist flow's CONFIRM-type buttons (currently just the
   * Import/Export step) — called from the chat page instead of the normal actionClick→NAVIGATE
   * path, since these choices never leave the browser. */
  async resolveLcAssistChoice(action: RMAction): Promise<void> {
    const payload = action.payload as { step: string; value: string } | undefined;
    if (!payload || this.busy()) return;
    this.pushMessage({ id: localId('user'), from: 'USER', type: 'TEXT', content: action.label, timestamp: Date.now() });

    if (payload.step === 'lcType') {
      this.lcAssistType = payload.value === 'EXPORT' ? 'EXPORT' : 'IMPORT';
      this.busy.set(true);
      this.rmState.set('RESPONDING');
      try {
        await this.stream.reveal(
          [
            {
              id: localId('lc-upload'),
              from: 'RM',
              type: 'ACTION',
              content:
                'Anh/chị vui lòng tải lên file đơn hàng (Purchase Order) — hỗ trợ PDF, ảnh, Word, Excel. ' +
                '(Bản demo: em sẽ mô phỏng đọc file, không phân tích nội dung file thật.)',
              actions: [{ label: 'Chọn file PO', icon: '📎', type: 'UPLOAD' }],
              timestamp: Date.now(),
            },
          ],
          (msg) => this.pushMessage(msg),
        );
      } finally {
        this.busy.set(false);
        this.rmState.set('IDLE');
      }
    }
  }

  /** BRD LC PO-upload flow, step 2: "analyze" the file (deterministic mock — see
   * po-analysis.service.ts) and present the extracted fields plus a CTA that hands them to
   * `/trade-finance/lc/create` via router state (handled by the chat page's handleAction). */
  async uploadPoFile(file: File): Promise<void> {
    if (this.busy()) return;
    this.pushMessage({ id: localId('user'), from: 'USER', type: 'TEXT', content: `📎 ${file.name}`, timestamp: Date.now() });
    this.busy.set(true);
    this.rmState.set('ANALYZING');
    try {
      const result = await this.lcAssist.analyzePo(file);
      const extracted: PoExtractedFields = { ...result.extracted, type: this.lcAssistType ?? result.extracted.type };
      this.lcAssistType = null;
      this.rmState.set('RESPONDING');

      const fieldMessages: RMMessage[] = [
        {
          id: localId('lc-extract'),
          from: 'RM',
          type: 'TEXT',
          content: `Em đã "đọc" xong đơn hàng: **${result.templateLabel}** (bản demo — số liệu mô phỏng nhất quán theo file, không đọc nội dung file thật).`,
          timestamp: Date.now(),
        },
        {
          id: localId('lc-metrics'),
          from: 'RM',
          type: 'METRIC',
          title: 'Thông tin trích xuất',
          metrics: [
            { label: 'Người thụ hưởng', value: extracted.beneficiary },
            { label: 'Giá trị', value: `${extracted.currency} ${new Intl.NumberFormat('en-US').format(extracted.amount)}` },
            { label: 'Loại LC', value: `${extracted.type} · ${extracted.subType}` },
            { label: 'Giao hàng chậm nhất', value: extracted.latestShipmentDate ?? '(chưa có — anh/chị điền nốt)' },
          ],
          timestamp: Date.now(),
        },
      ];
      if (result.missingFields.length) {
        fieldMessages.push({
          id: localId('lc-missing'),
          from: 'RM',
          type: 'INSIGHT',
          content: `Còn thiếu vài thông tin (${result.missingFields.length}) anh/chị điền nốt trong form nhé.`,
          timestamp: Date.now(),
        });
      }
      fieldMessages.push({
        id: localId('lc-fill'),
        from: 'RM',
        type: 'ACTION',
        actions: [{ label: '📝 Điền vào đơn mở LC', type: 'NAVIGATE', route: '/trade-finance/lc/create', payload: extracted }],
        timestamp: Date.now(),
      });
      await this.stream.reveal(fieldMessages, (msg) => this.pushMessage(msg));
    } catch {
      this.pushMessage({
        id: localId('lc-error'),
        from: 'RM',
        type: 'TEXT',
        content: 'Xin lỗi, em chưa đọc được file này. Anh/chị thử lại hoặc điền form thủ công nhé.',
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
      void this.startProactiveGreeting();
    } else {
      this.messages.set([this.fallbackGreetingMessage()]);
      persistMessages(this.messages());
    }
  }

  /** The single choke point for every genuinely NEW message entering this conversation (as
   * opposed to restored history set directly in the constructor via `messages.set(restored)`) —
   * see this class's own doc comment history for why that distinction matters. Voice UX upgrade:
   * this is therefore also the one place a new RM message is offered to the voice queue
   * (spec §5's "explicit event" requirement — never a render-triggered effect that could fire
   * more than once for the same message). `enqueueAssistantMessage()` itself decides whether the
   * message is actually eligible to be spoken (see rm-voice-queue.service.ts's
   * `resolveSpokenText()`); restored/historical messages never reach this method, so reopening an
   * old conversation or refreshing the page never re-speaks anything (spec §6/§7). */
  private pushMessage(msg: RMMessage): void {
    this.messages.update((list) => [...list, msg]);
    persistMessages(this.messages());
    if (msg.from === 'RM') this.voiceQueue.enqueueAssistantMessage(msg);
  }
}

/** Mirrors server/src/agent/response-templates.ts::buildCompletionMessage/buildFailureMessage —
 * duplicated client-side rather than shared (separate TS projects, no shared package, same
 * accepted-duplication precedent as this file's own CHECKER_BLOCKED_MESSAGE above) since the
 * approve/cancel endpoints return the raw AgentWorkflow record, not a pre-phrased message. */
function buildApprovalResultMessage(workflow: AgentWorkflowRecord): string {
  if (workflow.status !== 'COMPLETED') {
    return 'Rất tiếc, em chưa thực hiện được yêu cầu này. Anh/chị thử lại hoặc liên hệ RM để được hỗ trợ nhé.';
  }
  const r = (workflow.result ?? {}) as Record<string, unknown>;
  if (typeof r['paymentOrderId'] === 'string') return `Đã tạo lệnh chuyển tiền thành công (mã ${r['paymentOrderId']}) — lệnh đang chờ Checker phê duyệt theo đúng quy trình của MSB Business.`;
  if (typeof r['lcNumber'] === 'string') return `Đã gửi yêu cầu mở LC ${r['lcNumber']} — đang chờ phê duyệt (mô phỏng, không phát hành LC thật).`;
  if (typeof r['bgNumber'] === 'string') return `Đã gửi yêu cầu phát hành bảo lãnh ${r['bgNumber']} — đang chờ phê duyệt (mô phỏng).`;
  if (typeof r['collectionNumber'] === 'string') return `Đã tạo bộ nhờ thu ${r['collectionNumber']} (mô phỏng).`;
  return 'Đã hoàn tất yêu cầu của anh/chị.';
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
