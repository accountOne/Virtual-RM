import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RMAction, RMMessage, RMSeverity } from '../../interaction/rm-interaction.types';

const SEVERITY_CLASS: Record<RMSeverity, string> = {
  INFO: 'border-l-4 border-brand-400 bg-brand-50/40',
  LOW: 'border-l-4 border-positive bg-teal-50/40',
  MEDIUM: 'border-l-4 border-warn bg-amber-50/40',
  HIGH: 'border-l-4 border-warn bg-amber-50/70',
  CRITICAL: 'border-l-4 border-negative bg-red-50/40',
};
const SEVERITY_ICON: Record<RMSeverity, string> = {
  INFO: '💡',
  LOW: 'ℹ️',
  MEDIUM: '📅',
  HIGH: '⚠️',
  CRITICAL: '🚨',
};
// RECORD_LIST row icon-circle colors, keyed by the row's `badgeTone` — mirrors the mockup's
// per-row colored icon badges (red/orange/blue) rather than one flat color for every row.
const ROW_ICON_CLASS: Record<RMSeverity, string> = {
  INFO: 'bg-brand-100 text-brand-600',
  LOW: 'bg-sky-100 text-sky-600',
  MEDIUM: 'bg-amber-100 text-amber-600',
  HIGH: 'bg-orange-100 text-orange-600',
  CRITICAL: 'bg-red-100 text-red-600',
};

/** Phase 5.6 (spec §7/§8), restyled for the full-screen redesign — renders ONE `RMMessage`,
 * switched by `type`. One component with an internal switch (not a component per type) so every
 * bubble/card shares the same chrome by construction — see
 * docs/phase-5.6-interaction-architecture.md §3. */
@Component({
  selector: 'app-rm-message',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col" [class.items-end]="message.from === 'USER'">
      <div class="flex w-full" [class.justify-end]="message.from === 'USER'">
        <div class="max-w-[92%] rounded-2xl text-sm leading-relaxed" [ngClass]="isBubble ? bubbleClass : 'w-full'">
          <!-- TEXT / INSIGHT / RECOMMENDATION / HANDOFF / fallback: a plain conversational bubble -->
          <ng-container *ngIf="isBubble">
            <p *ngIf="message.title" class="font-semibold mb-1">{{ prefixIcon }}{{ message.title }}</p>
            <p class="whitespace-pre-line">
              <span *ngIf="!message.title">{{ prefixIcon }}</span>{{ message.content }}
            </p>
          </ng-container>

          <!-- METRIC: label/value chips -->
          <div *ngIf="message.type === 'METRIC'" class="bg-ink-50 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <p *ngIf="message.title" class="font-semibold text-ink-800 mb-2">{{ message.title }}</p>
            <div class="grid grid-cols-2 gap-2">
              <div *ngFor="let m of message.metrics" class="min-w-0">
                <p class="text-[11px] text-ink-400 truncate">{{ m.label }}</p>
                <p class="text-sm font-semibold text-ink-800 truncate">{{ m.value }}</p>
              </div>
            </div>
          </div>

          <!-- ALERT: same severity card language as app-alerts-list, reused here so an alert
               mentioned in chat reads visually the same as the Business Banking alert card. -->
          <div *ngIf="message.type === 'ALERT'" class="rounded-lg px-3.5 py-2.5 w-full" [ngClass]="severityClass[message.severity ?? 'INFO']">
            <div class="flex items-start gap-2.5">
              <span class="text-lg leading-none">{{ severityIcon[message.severity ?? 'INFO'] }}</span>
              <div class="flex-1 min-w-0">
                <p *ngIf="message.title" class="text-sm font-medium text-ink-800">{{ message.title }}</p>
                <p class="text-xs text-ink-600 mt-0.5 leading-relaxed">{{ message.content }}</p>
              </div>
            </div>
          </div>

          <!-- ENTITY: a compact summary card of one LC/BG/Collection record -->
          <div *ngIf="message.type === 'ENTITY' && message.entity" class="bg-ink-50 rounded-2xl px-3.5 py-2.5 w-full">
            <p class="font-semibold text-ink-800 mb-1.5">{{ message.entity.title }}</p>
            <div class="space-y-1">
              <div *ngFor="let f of message.entity.fields" class="flex justify-between gap-3 text-xs">
                <span class="text-ink-400">{{ f.label }}</span>
                <span class="text-ink-700 font-medium text-right">{{ f.value }}</span>
              </div>
            </div>
          </div>

          <!-- RECORD_LIST: a grouped card of clickable rows (LC/Guarantee/Collection lists,
               the proactive greeting's "Việc cần lưu ý" urgent items) — the full-screen
               redesign's headline card style. -->
          <div *ngIf="message.type === 'RECORD_LIST'" class="bg-rose-50/70 rounded-2xl px-3.5 py-3 w-full space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold text-ink-800">{{ message.title }}</p>
              <span *ngIf="message.badgeCount" class="text-[11px] font-semibold text-brand-700 bg-brand-100 rounded-full px-2 py-0.5 shrink-0">
                {{ message.badgeCount }}
              </span>
            </div>
            <p *ngIf="message.content" class="text-xs text-ink-500 -mt-1.5">{{ message.content }}</p>

            <div class="space-y-1.5">
              <button
                *ngFor="let r of message.records"
                type="button"
                class="w-full flex items-center gap-2.5 bg-white rounded-xl px-3 py-2.5 text-left hover:bg-ink-50/70 transition-colors"
                [disabled]="!r.action"
                (click)="r.action && actionClick.emit(r.action)"
              >
                <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" [ngClass]="rowIconClass[r.badgeTone ?? 'INFO']">
                  {{ r.icon ?? '📄' }}
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block text-sm font-medium text-ink-800 truncate">{{ r.title }}</span>
                  <span *ngIf="r.subtitle" class="block text-[11px] text-ink-400 truncate">{{ r.subtitle }}</span>
                </span>
                <span *ngIf="r.amount" class="text-xs font-semibold text-ink-700 shrink-0">{{ r.amount }}</span>
                <span *ngIf="r.badge" class="text-[10px] font-medium text-negative bg-red-50 rounded-full px-2 py-1 shrink-0">{{ r.badge }}</span>
                <span *ngIf="r.action" class="text-ink-300 shrink-0">›</span>
              </button>
            </div>

            <div *ngIf="message.insight" class="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 leading-relaxed">
              💡 {{ message.insight }}
            </div>

            <div *ngIf="message.actions?.length" class="flex flex-wrap gap-2 pt-0.5">
              <button
                *ngFor="let a of message.actions; let i = index"
                (click)="actionClick.emit(a)"
                class="text-xs font-semibold rounded-full px-3.5 py-2 transition-colors"
                [ngClass]="i === 0 ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-brand-200 text-brand-600 hover:bg-brand-50'"
              >
                {{ a.label }}
              </button>
            </div>
          </div>

          <!-- ACTION / NAVIGATION / CONFIRMATION: pill chips when actions carry an icon
               (category shortcuts), otherwise filled/outline CTA buttons. -->
          <ng-container *ngIf="hasActions">
            <p *ngIf="message.content" class="text-sm text-ink-600 mb-2">{{ message.content }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                *ngFor="let a of message.actions; let i = index"
                (click)="actionClick.emit(a)"
                class="text-xs font-semibold rounded-full transition-colors"
                [ngClass]="
                  a.icon
                    ? 'px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50'
                    : i === 0
                      ? 'px-3.5 py-2 bg-brand-500 text-white hover:bg-brand-600'
                      : 'px-3.5 py-2 border border-brand-200 text-brand-600 hover:bg-brand-50'
                "
              >
                {{ a.icon }} {{ a.label }}
              </button>
            </div>
          </ng-container>

          <!-- QUICK_REPLY: suggested-question chips -->
          <div *ngIf="message.type === 'QUICK_REPLY'" class="flex flex-wrap gap-1.5">
            <button
              *ngFor="let q of message.quickReplies"
              (click)="quickReply.emit(q)"
              class="text-xs px-2.5 py-1.5 rounded-full bg-ink-50 text-ink-600 hover:bg-ink-100 transition-colors"
            >
              {{ q }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1 mt-1 px-1" [class.mr-1]="message.from === 'USER'" [class.ml-1]="message.from !== 'USER'">
        <span class="text-[10px] text-ink-300">{{ message.timestamp | date: 'HH:mm' }}</span>
        <span *ngIf="message.from === 'USER'" class="text-[10px] text-sky-400" aria-label="Đã gửi">✓✓</span>
      </div>
    </div>
  `,
})
export class RmMessageComponent {
  @Input({ required: true }) message!: RMMessage;
  @Output() actionClick = new EventEmitter<RMAction>();
  @Output() quickReply = new EventEmitter<string>();

  readonly severityClass = SEVERITY_CLASS;
  readonly severityIcon = SEVERITY_ICON;
  readonly rowIconClass = ROW_ICON_CLASS;

  private static readonly BUBBLE_TYPES = new Set(['TEXT', 'INSIGHT', 'RECOMMENDATION', 'HANDOFF', 'CHECKLIST', 'TIMELINE']);
  private static readonly PREFIX: Partial<Record<string, string>> = {
    INSIGHT: '🔍 ',
    RECOMMENDATION: '💡 ',
    HANDOFF: '🤝 ',
  };

  get isBubble(): boolean {
    return RmMessageComponent.BUBBLE_TYPES.has(this.message.type) || !this.message.type;
  }

  get bubbleClass(): string {
    return this.message.from === 'USER' ? 'bg-brand-500 text-white rounded-br-sm px-3.5 py-2.5' : 'bg-ink-50 text-ink-700 rounded-bl-sm px-3.5 py-2.5';
  }

  get prefixIcon(): string {
    if (this.message.title) return '';
    return RmMessageComponent.PREFIX[this.message.type] ?? '';
  }

  get hasActions(): boolean {
    // ACTION/NAVIGATION/CONFIRMATION only — RECORD_LIST/ALERT render their own actions inline
    // above instead of falling through to this generic block.
    return (this.message.type === 'ACTION' || this.message.type === 'NAVIGATION' || this.message.type === 'CONFIRMATION') && !!this.message.actions?.length;
  }
}
