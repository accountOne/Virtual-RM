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

/** Phase 5.6 (spec §7/§8) — renders ONE `RMMessage`, switched by `type`. One component with an
 * internal switch (not a component per type) so every bubble shares the same card chrome and
 * severity coloring by construction — see docs/phase-5.6-interaction-architecture.md §3. */
@Component({
  selector: 'app-rm-message',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex" [class.justify-end]="message.from === 'USER'">
      <div
        class="max-w-[90%] rounded-2xl text-sm leading-relaxed"
        [ngClass]="isBubble ? bubbleClass : 'w-full'"
      >
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

        <!-- ACTION / NAVIGATION / CONFIRMATION: structured CTA buttons -->
        <div *ngIf="hasActions" class="flex flex-wrap gap-x-3 gap-y-1.5">
          <button
            *ngFor="let a of message.actions"
            (click)="actionClick.emit(a)"
            class="text-xs font-semibold underline underline-offset-2 text-brand-600"
          >
            {{ a.label }} →
          </button>
        </div>

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
  `,
})
export class RmMessageComponent {
  @Input({ required: true }) message!: RMMessage;
  @Output() actionClick = new EventEmitter<RMAction>();
  @Output() quickReply = new EventEmitter<string>();

  readonly severityClass = SEVERITY_CLASS;
  readonly severityIcon = SEVERITY_ICON;

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
    // Any message type can carry actions (e.g. an ALERT bubble in the proactive greeting with
    // a "Xem chi tiết" CTA attached) — not just the dedicated ACTION/NAVIGATION types.
    return !!this.message.actions?.length;
  }
}
