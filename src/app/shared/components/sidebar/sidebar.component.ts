import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  label: string;
  link: string;
  icon: string;
  /** Omit to show for every logged-in role. */
  rolesAllowed?: ('MAKER' | 'CHECKER' | 'ADMIN')[];
}

interface NavGroup {
  /** Omit for an ungrouped, top-level item (e.g. the primary "Tổng quan" entry). */
  heading?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { items: [{ label: 'Tổng quan', link: '/dashboard', icon: '🏠' }] },
  {
    heading: 'Tài khoản',
    items: [{ label: 'Quản lý tài khoản', link: '/accounts', icon: '💳' }],
  },
  {
    heading: 'Chuyển khoản & thanh toán',
    items: [
      { label: 'Thanh toán', link: '/payments', icon: '💸' },
      { label: 'Phê duyệt', link: '/payments/approval', icon: '✅', rolesAllowed: ['CHECKER', 'ADMIN'] },
    ],
  },
  {
    heading: 'Tín dụng & đầu tư',
    items: [
      { label: 'Khoản vay', link: '/loans', icon: '🏦' },
      { label: 'FX', link: '/fx', icon: '💱' },
      { label: 'Sản phẩm', link: '/products', icon: '💡' },
    ],
  },
  { items: [{ label: 'Báo cáo', link: '/reports', icon: '📊' }] },
  { items: [{ label: 'Virtual RM', link: '/virtual-rm', icon: '👩‍💼' }] },
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

      <nav class="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        <div *ngFor="let group of visibleNavGroups()">
          <p *ngIf="group.heading" class="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {{ group.heading }}
          </p>
          <div class="space-y-1">
            <a
              *ngFor="let item of group.items"
              [routerLink]="item.link"
              routerLinkActive="bg-brand-50 text-brand-700"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="close.emit()"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <span class="text-base">{{ item.icon }}</span>
              {{ item.label }}
            </a>
          </div>
        </div>
      </nav>

      <div class="px-3 py-4 border-t border-ink-100 space-y-1">
        <a
          routerLink="/demo"
          routerLinkActive="bg-brand-50 text-brand-700"
          [routerLinkActiveOptions]="{ exact: true }"
          (click)="close.emit()"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-500 hover:bg-ink-50 transition-colors"
        >
          <span class="text-base">🎬</span> Demo Mode
        </a>
        <a
          *ngIf="auth.hasRole('ADMIN')"
          routerLink="/admin/demo-data"
          routerLinkActive="bg-brand-50 text-brand-700"
          [routerLinkActiveOptions]="{ exact: true }"
          (click)="close.emit()"
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

  readonly auth = inject(AuthService);

  readonly visibleNavGroups = computed(() =>
    NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.rolesAllowed || this.auth.hasRole(...item.rolesAllowed)),
    })).filter((group) => group.items.length > 0),
  );
}
