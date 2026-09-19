// Voice UX upgrade (docs/virtual-rm-voice-design.md) — the session-level state
// `RmVoiceQueueService` owns. Mirrors the spec's own `VoiceSession` interface closely, adapted to
// this app's actual single-conversation-per-user model (see that doc's "Conversation model"
// section for why there is no multi-conversation `conversationId` list to switch between here).

export type VoiceQueueState = 'IDLE' | 'QUEUED' | 'SPEAKING' | 'PAUSED' | 'STOPPED';

export type VoiceMessagePriority = 'normal' | 'important' | 'critical';

export interface VoiceSession {
  sessionId: string;
  userId: string | null;
  /** Business date (YYYY-MM-DD, Asia/Ho_Chi_Minh) the daily briefing dedup key is scoped to —
   * see RmVoiceQueueService.hasSpokenDailyBriefing(). */
  businessDate: string;
  startedAt: string;
  spokenMessageIds: string[];
  dailyBriefingSpoken: boolean;
  enabled: boolean;
  state: VoiceQueueState;
}
