import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DailyDashboardService } from '../../../../core/services/daily-dashboard.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { AlertsListComponent } from '../../components/alerts/alerts.component';
import { DailyGreetingCardComponent } from '../../components/daily-greeting/daily-greeting.component';
import { PendingApprovalsCardComponent } from '../../components/pending-approvals/pending-approvals.component';
import { RecommendationsListComponent } from '../../components/recommendations/recommendations.component';
import { TasksListComponent } from '../../components/tasks/tasks.component';
import { UrgentItemsCardComponent } from '../../components/urgent-items/urgent-items.component';

/** BRD Daily Dashboard (docs/phase-5.5-brd-gap-analysis.md §4 item 1): greeting + cashflow +
 * ranked pending approvals + tasks + top-3 urgent items, from the new
 * GET /api/virtual-rm/daily-dashboard endpoint (built on the Reasoning/Priority Engine) —
 * not the legacy /api/rm/briefing path RmDataService still serves to the chat widget's small
 * teaser card, kept unchanged in this pass. */
@Component({
  selector: 'app-virtual-rm-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    DailyGreetingCardComponent,
    PendingApprovalsCardComponent,
    UrgentItemsCardComponent,
    AlertsListComponent,
    TasksListComponent,
    RecommendationsListComponent,
  ],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="dailyDashboard.loading() && !dailyDashboard.loaded()" label="Đang tải Virtual RM Dashboard..." />

      <ng-container *ngIf="dailyDashboard.loaded()">
        <app-daily-greeting-card [greeting]="dailyDashboard.dashboard()?.greeting ?? null" [cashflow]="dailyDashboard.dashboard()?.cashflow ?? null" />

        <div class="grid lg:grid-cols-2 gap-5">
          <app-urgent-items-card [items]="dailyDashboard.dashboard()?.urgentItems ?? []" />
          <app-pending-approvals-card [summary]="dailyDashboard.dashboard()?.pendingApprovals ?? null" />
        </div>

        <div class="grid lg:grid-cols-2 gap-5">
          <app-tasks-list [tasks]="rmData.openTasks()" (completed)="onCompleteTask($event)" />
          <app-alerts-list [alerts]="rmData.alerts()" />
        </div>

        <app-recommendations-list [recommendations]="rmData.recommendations()" />

        <!-- BRD Option 4.3 ("Xem dấu ấn cá nhân/doanh nghiệp") — see docs/phase-5.5-footprint.md -->
        <a routerLink="/footprint" class="card p-5 flex items-center justify-between hover:bg-ink-50 transition-colors">
          <div>
            <p class="text-sm font-semibold text-ink-800">🎖️ Dấu ấn cá nhân/doanh nghiệp</p>
            <p class="text-xs text-ink-400 mt-0.5">Xem hành trình đồng hành cùng MSB Business dưới dạng ảnh — tải về hoặc chia sẻ</p>
          </div>
          <span class="text-ink-300">→</span>
        </a>

        <div class="flex justify-center pt-2">
          <a routerLink="/virtual-rm/chat" class="btn-primary">💬 Hỏi Virtual RM</a>
        </div>
      </ng-container>
    </div>
  `,
})
export class VirtualRmDashboardPageComponent implements OnInit {
  readonly rmData = inject(RmDataService);
  readonly dailyDashboard = inject(DailyDashboardService);
  private readonly toast = inject(ToastService);

  ngOnInit(): void {
    if (!this.dailyDashboard.loaded()) void this.dailyDashboard.load();
  }

  async onCompleteTask(id: string): Promise<void> {
    await this.rmData.completeTask(id);
    this.toast.success('Đã đánh dấu hoàn thành việc cần làm.');
    await this.dailyDashboard.load();
  }
}
