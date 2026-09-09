import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Alert, AlertSeverity } from '../../../../core/models';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

const SEVERITY_ICON: Record<AlertSeverity, string> = { CRITICAL: '⚠️', WARNING: '📅', INFO: '💡' };
const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-4 border-negative bg-red-50/40',
  WARNING: 'border-l-4 border-warn bg-amber-50/40',
  INFO: 'border-l-4 border-brand-400 bg-brand-50/40',
};

@Component({
  selector: 'app-alerts-list',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <div class="card p-5">
      <h3 class="text-sm font-semibold text-ink-800 mb-3">⚠️ Cảnh báo cần chú ý</h3>
      <app-empty-state *ngIf="alerts.length === 0" icon="✅" title="Không có cảnh báo nào" subtitle="Mọi thứ đang ổn định." />
      <div class="space-y-2.5">
        <div *ngFor="let alert of alerts" class="rounded-lg p-3.5" [ngClass]="severityClass[alert.severity]">
          <div class="flex items-start gap-2.5">
            <span class="text-lg leading-none">{{ severityIcon[alert.severity] }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink-800">{{ alert.title }}</p>
              <p class="text-xs text-ink-500 mt-0.5 leading-relaxed">{{ alert.description }}</p>
              <button
                (click)="router.navigateByUrl(alert.actionLink)"
                class="text-xs font-semibold text-brand-600 mt-2 hover:underline"
              >
                {{ alert.actionLabel }} →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AlertsListComponent {
  @Input() alerts: Alert[] = [];
  readonly severityIcon = SEVERITY_ICON;
  readonly severityClass = SEVERITY_CLASS;
  readonly router = inject(Router);
}
