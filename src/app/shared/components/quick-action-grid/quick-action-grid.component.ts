import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface QuickAction {
  icon: string;
  label: string;
  route: string;
  badgeCount?: number;
}

/** Reusable "Thao tác nhanh" icon grid — extracted from dashboard.page.ts's previously-inline
 * markup so the same card styling is defined once. Purely presentational: the caller still owns
 * which actions exist and any role-gating (e.g. showing "Phê duyệt" only to Checker/Admin), it
 * just filters its own `actions` array before passing it in rather than this component knowing
 * about roles at all. */
@Component({
  selector: 'app-quick-action-grid',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <a *ngFor="let action of actions" [routerLink]="action.route" class="quick-action">
        <span class="text-xl">{{ action.icon }}</span>
        <span>{{ action.label }}</span>
        <span *ngIf="action.badgeCount" class="absolute top-2 right-2 badge bg-red-50 text-negative !px-1.5">
          {{ action.badgeCount }}
        </span>
      </a>
    </div>
  `,
  styles: [
    `
      .quick-action {
        @apply flex flex-col items-center justify-center gap-1.5 rounded-xl border border-ink-100 py-4 text-xs font-medium text-ink-600 hover:border-brand-200 hover:bg-brand-50/50 transition-colors relative;
      }
    `,
  ],
})
export class QuickActionGridComponent {
  @Input({ required: true }) actions: QuickAction[] = [];
}
