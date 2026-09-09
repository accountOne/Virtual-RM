import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem {
  label: string;
  link: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', link: '/dashboard', icon: '🏠' },
  { label: 'Virtual RM', link: '/virtual-rm', icon: '👩‍💼' },
  { label: 'Tài khoản', link: '/accounts', icon: '💳' },
  { label: 'Thanh toán', link: '/payments', icon: '💸' },
  { label: 'Phê duyệt', link: '/payments/approval', icon: '✅' },
  { label: 'Báo cáo', link: '/reports', icon: '📊' },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div
      *ngIf="open"
      class="fixed inset-0 z-40 bg-ink-900/40 lg:hidden"
      (click)="close.emit()"
    ></div>

    <aside
      class="fixed lg:static z-40 top-0 bottom-0 left-0 w-64 bg-white border-r border-ink-100 flex flex-col transition-transform lg:translate-x-0"
      [class.-translate-x-full]="!open"
      [class.translate-x-0]="open"
    >
      <div class="h-16 flex items-center px-5 border-b border-ink-100 lg:hidden">
        <span class="font-semibold text-ink-800">Menu</span>
      </div>

      <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <a
          *ngFor="let item of navItems"
          [routerLink]="item.link"
          routerLinkActive="bg-brand-50 text-brand-700"
          [routerLinkActiveOptions]="{ exact: item.link === '/dashboard' }"
          (click)="close.emit()"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <span class="text-base">{{ item.icon }}</span>
          {{ item.label }}
        </a>
      </nav>

      <div class="px-3 py-4 border-t border-ink-100 space-y-1">
        <a
          routerLink="/demo"
          routerLinkActive="bg-brand-50 text-brand-700"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-500 hover:bg-ink-50 transition-colors"
        >
          <span class="text-base">🎬</span> Demo Mode
        </a>
        <a
          routerLink="/admin/demo-data"
          routerLinkActive="bg-brand-50 text-brand-700"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-500 hover:bg-ink-50 transition-colors"
        >
          <span class="text-base">⚙️</span> Admin
        </a>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();
  readonly navItems = NAV_ITEMS;
}
