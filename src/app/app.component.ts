import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RmDataService } from './core/services/rm-data.service';
import { DailyDashboardService } from './core/services/daily-dashboard.service';
import { AuthService } from './core/services/auth.service';
import { HeaderComponent } from './shared/components/header/header.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { RmWidgetComponent } from './features/virtual-rm/components/rm-widget/rm-widget.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    SidebarComponent,
    ToastContainerComponent,
    ConfirmDialogComponent,
    RmWidgetComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly rmData = inject(RmDataService);
  private readonly dailyDashboard = inject(DailyDashboardService);
  readonly mobileMenuOpen = signal(false);

  constructor() {
    // Mock data is only worth loading once someone is actually logged in.
    effect(() => {
      if (this.auth.isAuthenticated() && !this.rmData.loaded() && !this.rmData.loading()) {
        void this.rmData.loadAll();
      }
    });
    // Phase 5.6 Proactive RM (Flow 6): load the Daily Dashboard (greeting + cashflow +
    // Priority Engine urgent items) alongside the rest of the app data so it's already
    // available the moment the customer opens chat — see rm-chat.component.ts's proactive
    // greeting, which reads `dailyDashboard.dashboard()` instead of re-fetching itself.
    effect(() => {
      if (this.auth.isAuthenticated() && !this.dailyDashboard.loaded() && !this.dailyDashboard.loading()) {
        void this.dailyDashboard.load();
      }
    });
  }
}
