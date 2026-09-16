import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RmDataService } from '../../core/services/rm-data.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/** "Thông báo" nav item (docs/ui-ux-audit.md #2) — a full page for the same alert feed the
 * header bell dropdown already shows (RmDataService.alerts(), fed by GET /api/alerts), so
 * notifications survive closing the dropdown instead of only being visible for a moment. */
@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <div class="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Thông báo</h1>
        <p class="text-sm text-ink-500 mt-1">{{ rmData.alerts().length }} thông báo</p>
      </div>

      <app-empty-state
        *ngIf="rmData.alerts().length === 0"
        icon="🔔"
        title="Không có thông báo mới"
        subtitle="Cảnh báo về lệnh chờ duyệt, hạn mức, chứng từ sẽ hiện ở đây."
      />

      <div class="card divide-y divide-ink-100" *ngIf="rmData.alerts().length > 0">
        <button
          *ngFor="let alert of rmData.alerts()"
          (click)="goTo(alert.actionLink)"
          class="w-full text-left px-4 py-3.5 hover:bg-ink-50 transition-colors flex items-start gap-3"
        >
          <span class="text-lg leading-none mt-0.5">{{ severityIcon(alert.severity) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm text-ink-800 font-medium">{{ alert.title }}</span>
            <span class="block text-xs text-ink-500 mt-1">{{ alert.description }}</span>
            <span class="block text-xs text-ink-400 mt-1">{{ alert.date | date: 'dd/MM/yyyy' }}</span>
          </span>
          <span class="text-xs font-medium text-brand-600 whitespace-nowrap mt-0.5">{{ alert.actionLabel }}</span>
        </button>
      </div>
    </div>
  `,
})
export class NotificationsPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly router = inject(Router);

  severityIcon(severity: string): string {
    return severity === 'CRITICAL' ? '⚠️' : severity === 'WARNING' ? '📅' : '💡';
  }

  goTo(link: string): void {
    if (link) this.router.navigateByUrl(link);
  }
}
