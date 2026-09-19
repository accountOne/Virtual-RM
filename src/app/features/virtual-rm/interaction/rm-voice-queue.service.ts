import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { RMMessage, RMMessageType } from './rm-interaction.types';
import { RmVoiceService } from './rm-voice.service';
import { VoiceMessagePriority, VoiceQueueState } from './voice-session.model';

/** Message types whose `content` (if any) is a real spoken sentence — everything else (METRIC's
 * label/value chips, QUICK_REPLY's suggestion chips, TYPING, CHECKLIST/TIMELINE's structured
 * field dump, ENTITY's field list) is presentational-only by default and never spoken unless a
 * message explicitly opts in via `voice.enabled: true` + `voice.spokenText`. */
const VOICE_ELIGIBLE_TYPES_BY_DEFAULT = new Set<RMMessageType>([
  'TEXT',
  'INSIGHT',
  'RECOMMENDATION',
  'ALERT',
  'HANDOFF',
  'RECORD_LIST',
  'ACTION',
  'CONFIRMATION',
  'NAVIGATION',
]);

const PRIORITY_RANK: Record<VoiceMessagePriority, number> = { critical: 0, important: 1, normal: 2 };
const DAILY_BRIEFING_KEY_PREFIX = 'voice:daily-briefing';

/** Strips everything that is display-only, never spoken — emoji/pictographs, markdown emphasis
 * markers, stray HTML tags a message might carry, and collapses whitespace left behind. Defense
 * in depth: message builders are expected to already hand this clean prose, but a TTS engine must
 * never depend on that being true everywhere forever. */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    // Pictographs/emoji, arrows, misc symbols, and the variation-selector/ZWJ bytes that often
    // ride along with them (e.g. "⚠️" = U+26A0 WARNING SIGN + U+FE0F VARIATION SELECTOR-16 — the
    // selector alone is outside every pictograph range above it, so it needs its own strip or a
    // bare space is left behind where the icon used to be).
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The ONLY function anywhere in this app that decides what text (if any) a message may speak —
 * see rm-interaction.types.ts's RMMessageVoice doc comment for the "why" (never DOM text, never
 * a button label). Returns null for "do not speak this", exactly like the voice policy's
 * exhaustive "RM KHÔNG ĐƯỢC ĐỌC" list. */
export function resolveSpokenText(message: RMMessage): string | null {
  if (message.from !== 'RM') return null; // user's own words are never read back
  if (message.voice?.enabled === false) return null;
  const explicit = message.voice?.spokenText;
  if (explicit && explicit.trim()) return sanitizeForSpeech(explicit);
  const isDefaultEligible = VOICE_ELIGIBLE_TYPES_BY_DEFAULT.has(message.type);
  if (message.voice?.enabled !== true && !isDefaultEligible) return null;
  const raw = message.content;
  if (!raw || !raw.trim()) return null;
  return sanitizeForSpeech(raw);
}

export function resolvePriority(message: RMMessage): VoiceMessagePriority {
  if (message.voice?.priority) return message.voice.priority;
  if (message.type === 'ALERT' && message.severity === 'CRITICAL') return 'critical';
  if (message.type === 'ALERT' && message.severity === 'HIGH') return 'important';
  if (message.type === 'ACTION' || message.type === 'CONFIRMATION') return 'important';
  return 'normal';
}

interface QueueItem {
  message: RMMessage;
  spokenText: string;
  priority: VoiceMessagePriority;
}

/**
 * Central voice queue — every TTS trigger in the app goes through here, never straight to
 * `RmVoiceService.speak()` (the low-level "how to actually call cloud/browser TTS" layer this
 * wraps). See docs/virtual-rm-voice-design.md for the full architecture and the bugs this
 * replaced (the old per-component `effect()` re-spoke entire conversation history on every
 * navigation to the chat page, and re-spoke the whole greeting on every "Hội thoại mới").
 *
 * Responsibilities match the spec's own VoiceQueueManager list: enqueue/speak/pause/resume/stop/
 * clearQueue/markAsSpoken/isSpoken/getCurrentMessage/setEnabled/setMuted — the last two delegate
 * to RmVoiceService.speechEnabled, which already owns that single on/off toggle and its own
 * localStorage persistence; duplicating it here would just be two sources of truth for one flag.
 */
@Injectable({ providedIn: 'root' })
export class RmVoiceQueueService {
  private readonly voice = inject(RmVoiceService);
  private readonly auth = inject(AuthService);

  readonly state = signal<VoiceQueueState>('IDLE');
  readonly currentMessage = signal<RMMessage | null>(null);

  private queue: QueueItem[] = [];
  private processing = false;
  /** Each message is spoken at most once per voice session — reset only by a fresh app load
   * (a full reload also resets this in-memory Set, which is fine: it's a defense against a
   * message being enqueued twice in the SAME session, e.g. a re-render, not a durable log). */
  private readonly spokenMessageIds = new Set<string>();

  // ---- Enable/mute — thin delegation to RmVoiceService, the single source of truth -----------

  setEnabled(enabled: boolean): void {
    if (this.voice.speechEnabled() === enabled) return;
    this.voice.toggleSpeechOutput();
  }

  setMuted(muted: boolean): void {
    this.setEnabled(!muted);
  }

  isEnabled(): boolean {
    return this.voice.speechEnabled();
  }

  // ---- Queue -----------------------------------------------------------------------------------

  /** The one explicit entry point for "a new RM message exists, consider speaking it" — called
   * directly by rm-chat-session.service.ts's pushMessage() for genuinely new content, NEVER from
   * a lifecycle hook or a render-triggered effect (spec §5 — those can fire more than once for
   * the exact same message and have no reliable way to tell "new" from "already rendered").
   *
   * The `speechEnabled()` check MUST run before `spokenMessageIds` is touched — this call happens
   * exactly once per message (never retried/replayed), so a message that arrives while voice
   * output is off (its default, persisted per-browser state — see RmVoiceService) never gets a
   * second chance to speak. Marking it "already spoken" anyway would permanently and silently
   * swallow it, discovered live: a customer who logs in with voice off and then turns it on
   * moments later never heard that login's daily briefing at all, because the dedup slot for that
   * message/session had already been consumed before the toggle click. */
  enqueueAssistantMessage(message: RMMessage): void {
    if (this.spokenMessageIds.has(message.id)) return; // already spoken this session — never twice
    if (!this.voice.speechEnabled()) return; // feature off — nothing was delivered, so nothing to dedup yet
    const spokenText = resolveSpokenText(message);
    if (!spokenText) return; // icon/button/metric-only/user message/explicitly silent — nothing to say
    this.spokenMessageIds.add(message.id);
    this.insertByPriority({ message, spokenText, priority: resolvePriority(message) });
    void this.processQueue();
  }

  /** The one case allowed to re-read something already spoken (spec §16) — the "🔊 Đọc" button on
   * a message. Bypasses the spokenMessageIds dedup entirely; still respects voice.enabled:false
   * (a message marked "never speak this" stays silent even on a manual click) and jumps ahead of
   * anything already queued, since the customer explicitly asked for THIS message right now. */
  speakManually(message: RMMessage): void {
    const spokenText = resolveSpokenText(message);
    if (!spokenText) return;
    this.stop();
    this.queue = [{ message, spokenText, priority: 'critical' }];
    void this.processQueue();
  }

  markAsSpoken(id: string): void {
    this.spokenMessageIds.add(id);
  }

  isSpoken(id: string): boolean {
    return this.spokenMessageIds.has(id);
  }

  getCurrentMessage(): RMMessage | null {
    return this.currentMessage();
  }

  clearQueue(): void {
    this.queue = [];
  }

  stop(): void {
    this.clearQueue();
    this.voice.stopSpeaking();
    this.currentMessage.set(null);
    this.processing = false;
    this.state.set('STOPPED');
    queueMicrotask(() => {
      if (this.state() === 'STOPPED') this.state.set('IDLE');
    });
  }

  pause(): void {
    if (this.state() !== 'SPEAKING') return;
    this.voice.pauseSpeaking();
    this.state.set('PAUSED');
  }

  resume(): void {
    if (this.state() !== 'PAUSED') return;
    this.voice.resumeSpeaking();
    this.state.set('SPEAKING');
  }

  private insertByPriority(item: QueueItem): void {
    const idx = this.queue.findIndex((q) => PRIORITY_RANK[q.priority] > PRIORITY_RANK[item.priority]);
    if (idx === -1) this.queue.push(item);
    else this.queue.splice(idx, 0, item);
    this.state.set('QUEUED');
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length) {
      const item = this.queue.shift()!;
      this.currentMessage.set(item.message);
      this.state.set('SPEAKING');
      await this.voice.speak(item.spokenText);
      this.currentMessage.set(null);
    }
    this.processing = false;
    if (this.state() !== 'STOPPED') this.state.set('IDLE');
  }

  // ---- Daily briefing dedup (spec §11) ----------------------------------------------------------

  /** `voice:daily-briefing:{userId}:{businessDate}:{loginSessionId}` — a page refresh reuses the
   * same loginSessionId (see auth.service.ts), so this correctly does NOT re-arm on refresh/
   * navigate/close-reopen-RM; a genuine logout+login (even in the same tab) gets a fresh
   * loginSessionId, so it correctly DOES re-arm for that new session (acceptance test 13). */
  private dailyBriefingKey(): string | null {
    const userId = this.auth.currentUser()?.username;
    const sessionId = this.auth.loginSessionId();
    if (!userId || !sessionId) return null;
    const businessDate = new Date().toISOString().slice(0, 10);
    return `${DAILY_BRIEFING_KEY_PREFIX}:${userId}:${businessDate}:${sessionId}`;
  }

  hasSpokenDailyBriefing(): boolean {
    const key = this.dailyBriefingKey();
    if (!key) return false;
    try {
      return sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  markDailyBriefingSpoken(): void {
    const key = this.dailyBriefingKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      // ignore — worst case the briefing can be spoken again this session
    }
  }
}
