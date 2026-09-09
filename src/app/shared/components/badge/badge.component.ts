import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type BadgeTone = 'critical' | 'warning' | 'info' | 'positive' | 'neutral' | 'high' | 'medium' | 'low';

const TONE_CLASSES: Record<BadgeTone, string> = {
  critical: 'bg-red-50 text-negative',
  warning: 'bg-amber-50 text-warn',
  info: 'bg-brand-50 text-brand-600',
  positive: 'bg-teal-50 text-positive',
  neutral: 'bg-ink-100 text-ink-600',
  high: 'bg-red-50 text-negative',
  medium: 'bg-amber-50 text-warn',
  low: 'bg-ink-100 text-ink-600',
};

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="badge" [ngClass]="toneClass"><span *ngIf="dot" class="w-1.5 h-1.5 rounded-full bg-current"></span>{{ label }}</span>`,
})
export class BadgeComponent {
  @Input() tone: BadgeTone = 'neutral';
  @Input() label = '';
  @Input() dot = true;

  get toneClass(): string {
    return TONE_CLASSES[this.tone];
  }
}
