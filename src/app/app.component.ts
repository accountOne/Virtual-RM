import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RmDataService } from './core/services/rm-data.service';
import { HeaderComponent } from './shared/components/header/header.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { RmWidgetComponent } from './features/virtual-rm/components/rm-widget/rm-widget.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    SidebarComponent,
    ToastContainerComponent,
    ConfirmDialogComponent,
    RmWidgetComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  private readonly rmData = inject(RmDataService);
  readonly mobileMenuOpen = signal(false);

  ngOnInit(): void {
    void this.rmData.loadAll();
  }
}
