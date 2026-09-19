import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RmDataService } from '../../../core/services/rm-data.service';

interface TabItem {
  icon: string;
  label: string;
  route: string;
}

const TABS: TabItem[] = [
  { icon: '🏠', label: 'Tổng quan', route: '/dashboard' },
  { icon: '💳', label: 'Tài khoản', route: '/accounts' },
  { icon: '🔁', label: 'Giao dịch', route: '/payments' },
  { icon: '🔔', label: 'Thông báo', route: '/notifications' },
];

/**
 * Primary mobile navigation (`lg:hidden` — the existing off-canvas `<app-sidebar>` remains the
 * always-visible column on desktop, unchanged). Adds a bottom-tab pattern matching the mockup's
 * Dashboard-home screen instead of requiring a hamburger tap for every navigation on mobile.
 *
 * Doesn't replace the sidebar or remove any of its destinations — "Thêm" (the 5th tab) opens the
 * SAME sidebar drawer the header hamburger already opens (`AppComponent.mobileMenuOpen`, passed
 * in via `@Input open` / `@Output moreClick` rather than owning its own signal, so the two
 * triggers and the drawer itself never desync), so every nav item not directly tabbed (Trade
 * Finance, Loans, FX, Products, Reports, Settings, Activity history, Admin) stays reachable
 * exactly as today.
 */
@Component({
  selector: 'app-bottom-tab-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav
      class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-ink-100 flex items-stretch"
      style="padding-bottom: env(safe-area-inset-bottom)"
      aria-label="Điều hướng chính"
    >
      <a
        *ngFor="let tab of tabs"
        [routerLink]="tab.route"
        routerLinkActive="text-brand-600"
        [routerLinkActiveOptions]="{ exact: false }"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-ink-400 text-[10px] font-medium min-w-0"
      >
        <span class="relative text-lg leading-none">
          {{ tab.icon }}
          <span
            *ngIf="tab.route === '/notifications' && alertCount() > 0"
            class="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-negative text-white text-[9px] font-semibold leading-none flex items-center justify-center"
          >{{ alertCount() > 9 ? '9+' : alertCount() }}</span>
        </span>
        <span class="truncate max-w-full">{{ tab.label }}</span>
      </a>
      <button
        type="button"
        (click)="moreClick.emit()"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-w-0"
        [class.text-brand-600]="open"
        [class.text-ink-400]="!open"
        aria-label="Thêm"
      >
        <span class="text-lg leading-none">⋯</span>
        <span>Thêm</span>
      </button>
    </nav>
  `,
})
export class BottomTabBarComponent {
  private readonly rmData = inject(RmDataService);
  readonly tabs = TABS;
  readonly alertCount = () => this.rmData.alerts().length;

  /** Mirrors `AppComponent.mobileMenuOpen` — passed in rather than owned locally so the "Thêm"
   * tab's highlighted state and the header hamburger's drawer never disagree. */
  @Input() open = false;
  @Output() moreClick = new EventEmitter<void>();
}
