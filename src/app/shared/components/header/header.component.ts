import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Output, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, ROLE_LABEL } from '../../../core/services/auth.service';
import { RmDataService } from '../../../core/services/rm-data.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="h-16 shrink-0 flex items-center justify-between px-4 lg:px-6 bg-white border-b border-ink-100 sticky top-0 z-30">
      <div class="flex items-center gap-3">
        <button class="lg:hidden text-ink-500 p-1" (click)="menuToggle.emit()" aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <a routerLink="/dashboard" class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold text-sm">M</div>
          <span class="font-semibold text-ink-800 hidden sm:inline">MSB Business Banking</span>
        </a>
      </div>

      <div class="flex items-center gap-3 sm:gap-4">
        <!-- Notifications -->
        <div class="relative">
          <button
            class="relative text-ink-500 hover:text-ink-700 p-1"
            aria-label="Thông báo"
            (click)="toggleBell(); $event.stopPropagation()"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span
              *ngIf="rmData.alerts().length > 0"
              class="absolute -top-1 -right-1 bg-negative text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center"
            >{{ rmData.alerts().length }}</span>
          </button>

          <div
            *ngIf="bellOpen()"
            class="absolute right-0 mt-2 w-80 max-w-[90vw] card shadow-pop py-2 z-40"
            (click)="$event.stopPropagation()"
          >
            <p class="px-3.5 py-1.5 text-xs font-semibold text-ink-400">Cảnh báo &amp; thông báo</p>
            <div class="max-h-80 overflow-y-auto">
              <button
                *ngFor="let alert of rmData.alerts()"
                (click)="goTo(alert.actionLink)"
                class="w-full text-left px-3.5 py-2.5 hover:bg-ink-50 transition-colors flex items-start gap-2.5"
              >
                <span class="text-base leading-none mt-0.5">{{ severityIcon(alert.severity) }}</span>
                <span class="min-w-0">
                  <span class="block text-sm text-ink-800 font-medium truncate">{{ alert.title }}</span>
                  <span class="block text-xs text-ink-400 mt-0.5 line-clamp-2">{{ alert.description }}</span>
                </span>
              </button>
              <p *ngIf="rmData.alerts().length === 0" class="px-3.5 py-4 text-sm text-ink-400 text-center">
                Không có thông báo mới
              </p>
            </div>
          </div>
        </div>

        <!-- Profile -->
        <div class="relative pl-3 border-l border-ink-100">
          <button class="flex items-center gap-2" (click)="toggleProfile(); $event.stopPropagation()">
            <div class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
              {{ initials() }}
            </div>
            <div class="hidden sm:block leading-tight text-left">
              <p class="text-sm font-medium text-ink-800">{{ rmData.customer()?.companyName || '...' }}</p>
              <p class="text-xs text-ink-400">{{ roleLabel() }}</p>
            </div>
          </button>

          <div
            *ngIf="profileOpen()"
            class="absolute right-0 mt-2 w-64 card shadow-pop py-2 z-40"
            (click)="$event.stopPropagation()"
          >
            <div class="px-3.5 py-2 border-b border-ink-100">
              <p class="text-sm font-medium text-ink-800">{{ auth.currentUser()?.username }}</p>
              <p class="text-xs text-ink-400 mt-0.5">{{ roleLabel() }}</p>
            </div>
            <a
              routerLink="/company/profile"
              (click)="profileOpen.set(false)"
              class="block px-3.5 py-2 text-sm text-ink-600 hover:bg-ink-50"
            >
              🏢 Hồ sơ doanh nghiệp
            </a>
            <button
              (click)="logout()"
              class="block w-full text-left px-3.5 py-2 text-sm text-negative hover:bg-red-50"
            >
              ↪ Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  readonly rmData = inject(RmDataService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @Output() menuToggle = new EventEmitter<void>();

  readonly bellOpen = signal(false);
  readonly profileOpen = signal(false);

  @HostListener('document:click')
  closeMenus(): void {
    this.bellOpen.set(false);
    this.profileOpen.set(false);
  }

  toggleBell(): void {
    this.bellOpen.update((v) => !v);
    this.profileOpen.set(false);
  }

  toggleProfile(): void {
    this.profileOpen.update((v) => !v);
    this.bellOpen.set(false);
  }

  goTo(link: string): void {
    this.bellOpen.set(false);
    this.router.navigateByUrl(link);
  }

  logout(): void {
    this.profileOpen.set(false);
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  roleLabel(): string {
    const role = this.auth.currentUser()?.role;
    return role ? ROLE_LABEL[role] : '';
  }

  severityIcon(severity: string): string {
    return severity === 'CRITICAL' ? '⚠️' : severity === 'WARNING' ? '📅' : '💡';
  }

  initials(): string {
    const name = this.rmData.customer()?.companyName ?? '';
    return (
      name
        .split(' ')
        .filter((w) => /^[A-ZÀ-Ỹ]/.test(w))
        .slice(0, 2)
        .map((w) => w[0])
        .join('') || 'AB'
    );
  }
}
