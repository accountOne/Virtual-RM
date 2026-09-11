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
import { RmChatLauncherComponent } from './features/virtual-rm/components/rm-chat-launcher/rm-chat-launcher.component';
import { RmChatSessionService } from './features/virtual-rm/interaction/rm-chat-session.service';
import { SessionTimeoutService } from './core/services/session-timeout.service';

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
    RmChatLauncherComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly rmData = inject(RmDataService);
  private readonly dailyDashboard = inject(DailyDashboardService);
  // Eagerly instantiate the chat session singleton here (app root) so the proactive greeting
  // is already built by the time the customer navigates to the full-screen /virtual-rm/chat
  // page — see rm-chat-session.service.ts's doc comment.
  private readonly chatSession = inject(RmChatSessionService);
  // Login & Session Security upgrade — eagerly instantiated so the idle-timeout warning polls
  // and fires regardless of which page/route the customer is currently on.
  private readonly sessionTimeout = inject(SessionTimeoutService);
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
