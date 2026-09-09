import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ChatUiService } from '../../../../core/services/chat-ui.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { AlertsListComponent } from '../../components/alerts/alerts.component';
import { BriefingCardComponent } from '../../components/briefing/briefing.component';
import { RecommendationsListComponent } from '../../components/recommendations/recommendations.component';
import { TasksListComponent } from '../../components/tasks/tasks.component';

@Component({
  selector: 'app-virtual-rm-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    LoadingSpinnerComponent,
    BriefingCardComponent,
    AlertsListComponent,
    TasksListComponent,
    RecommendationsListComponent,
  ],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="rmData.loading() && !rmData.loaded()" label="Đang tải Virtual RM Dashboard..." />

      <ng-container *ngIf="rmData.loaded()">
        <app-briefing-card [briefing]="rmData.briefing()" />

        <div class="grid lg:grid-cols-2 gap-5">
          <app-tasks-list [tasks]="rmData.openTasks()" (completed)="onCompleteTask($event)" />
          <app-alerts-list [alerts]="rmData.alerts()" />
        </div>

        <app-recommendations-list [recommendations]="rmData.recommendations()" />

        <div class="flex justify-center pt-2">
          <button class="btn-primary" (click)="chatUi.openChat()">💬 Hỏi Virtual RM</button>
        </div>
      </ng-container>
    </div>
  `,
})
export class VirtualRmDashboardPageComponent {
  readonly rmData = inject(RmDataService);
  readonly chatUi = inject(ChatUiService);
  private readonly toast = inject(ToastService);

  async onCompleteTask(id: string): Promise<void> {
    await this.rmData.completeTask(id);
    this.toast.success('Đã đánh dấu hoàn thành việc cần làm.');
  }
}
