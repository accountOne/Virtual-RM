import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RmDataService } from './core/services/rm-data.service';
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
  readonly mobileMenuOpen = signal(false);

  constructor() {
    // Mock data is only worth loading once someone is actually logged in.
    effect(() => {
      if (this.auth.isAuthenticated() && !this.rmData.loaded() && !this.rmData.loading()) {
        void this.rmData.loadAll();
      }
    });
  }
}
