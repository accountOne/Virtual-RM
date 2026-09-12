import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, ROLE_LABEL } from '../../../core/services/auth.service';
import { RmDataService } from '../../../core/services/rm-data.service';
import { ToastService } from '../../../core/services/toast.service';
import { RmChatSessionService } from '../../../features/virtual-rm/interaction/rm-chat-session.service';

interface SearchResult {
  icon: string;
  title: string;
  subtitle: string;
  link: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
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
        <!-- Help center — hands off straight to the Virtual RM chat, the actual support channel in this demo -->
        <button
          class="hidden sm:flex items-center gap-1.5 text-ink-400 hover:text-ink-600 p-1 text-xs font-medium"
          aria-label="Trung tâm hỗ trợ"
          (click)="goTo('/virtual-rm/chat')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.29c-.7.32-1 .77-1 1.46v.25" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.5" r=".9" fill="currentColor"/></svg>
          Trung tâm hỗ trợ
        </button>

        <!-- Search, Notifications, and Profile below all open a panel positioned "fixed right-4
             lg:right-6 top-16" — fixed to the header's own right padding/height, not "absolute
             right-0" against each button's own tiny wrapper. That was the previous approach, and
             it broke exactly for Search: its wrapper sits well left of the header's actual right
             edge (Bell/Profile are further right), so a w-80 (320px) panel anchored to that
             narrow wrapper's right-0 overflowed off the LEFT edge of the viewport on a phone
             (confirmed live — the panel rendered spanning from off-screen-left to mid-header,
             nowhere near the search icon that opened it). Anchoring to the header's own edge
             instead makes every panel's position independent of which button opened it. -->
        <!-- Search -->
        <div class="relative">
          <button
            class="text-ink-400 hover:text-ink-600 p-1"
            aria-label="Tìm kiếm"
            (click)="toggleSearch(); $event.stopPropagation()"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>

          <div
            *ngIf="searchOpen()"
            class="fixed right-4 lg:right-6 top-16 mt-2 w-80 max-w-[90vw] card shadow-pop p-3 z-40"
            (click)="$event.stopPropagation()"
          >
            <input
              [(ngModel)]="searchQuery"
              type="text"
              autofocus
              placeholder="Tìm tài khoản, giao dịch, sản phẩm, việc cần làm..."
              class="w-full rounded-lg border border-ink-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
            />
            <div class="mt-2 max-h-80 overflow-y-auto" *ngIf="searchQuery.trim().length > 0">
              <ng-container *ngIf="searchResults() as results">
                <button
                  *ngFor="let r of results"
                  (click)="goToResult(r)"
                  class="w-full text-left px-2 py-2 hover:bg-ink-50 rounded-lg transition-colors flex items-start gap-2.5"
                >
                  <span class="text-base leading-none mt-0.5">{{ r.icon }}</span>
                  <span class="min-w-0">
                    <span class="block text-sm text-ink-800 font-medium truncate">{{ r.title }}</span>
                    <span class="block text-xs text-ink-400 mt-0.5 truncate">{{ r.subtitle }}</span>
                  </span>
                </button>
                <p *ngIf="results.length === 0" class="px-2 py-4 text-sm text-ink-400 text-center">
                  Không tìm thấy kết quả phù hợp.
                </p>
              </ng-container>
            </div>
          </div>
        </div>

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
            class="fixed right-4 lg:right-6 top-16 mt-2 w-80 max-w-[90vw] card shadow-pop py-2 z-40"
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
            class="fixed right-4 lg:right-6 top-16 mt-2 w-64 card shadow-pop py-2 z-40"
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
  readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly chatSession = inject(RmChatSessionService);

  @Output() menuToggle = new EventEmitter<void>();

  readonly bellOpen = signal(false);
  readonly profileOpen = signal(false);
  readonly searchOpen = signal(false);
  searchQuery = '';

  @HostListener('document:click')
  closeMenus(): void {
    this.bellOpen.set(false);
    this.profileOpen.set(false);
    this.searchOpen.set(false);
  }

  toggleBell(): void {
    this.bellOpen.update((v) => !v);
    this.profileOpen.set(false);
    this.searchOpen.set(false);
  }

  toggleProfile(): void {
    this.profileOpen.update((v) => !v);
    this.bellOpen.set(false);
    this.searchOpen.set(false);
  }

  toggleSearch(): void {
    this.searchOpen.update((v) => !v);
    this.bellOpen.set(false);
    this.profileOpen.set(false);
    if (!this.searchOpen()) this.searchQuery = '';
  }

  /** Free-text search across accounts, transactions, products, and open tasks — matched
   * case- and diacritic-insensitively (Vietnamese input rarely matches accents exactly). */
  searchResults(): SearchResult[] {
    const q = normalize(this.searchQuery);
    if (!q) return [];
    const results: SearchResult[] = [];

    for (const acc of this.rmData.accounts()) {
      if (normalize(acc.accountName).includes(q) || acc.accountNumber.includes(q)) {
        results.push({ icon: '💳', title: acc.accountName, subtitle: acc.accountNumber, link: '/accounts' });
      }
    }
    for (const p of this.rmData.products()) {
      if (normalize(p.name).includes(q) || normalize(p.category).includes(q)) {
        results.push({ icon: '💡', title: p.name, subtitle: p.category, link: p.ctaLink });
      }
    }
    for (const task of this.rmData.tasks()) {
      if (task.status === 'OPEN' && normalize(task.title).includes(q)) {
        results.push({ icon: '📋', title: task.title, subtitle: task.description, link: task.actionLink });
      }
    }
    for (const t of this.rmData.transactions()) {
      if (normalize(t.description).includes(q) || normalize(t.counterparty).includes(q)) {
        results.push({ icon: '💸', title: t.description, subtitle: t.counterparty, link: '/accounts' });
      }
    }

    return results.slice(0, 8);
  }

  goToResult(result: SearchResult): void {
    this.searchOpen.set(false);
    this.searchQuery = '';
    this.router.navigateByUrl(result.link);
  }

  goTo(link: string): void {
    this.bellOpen.set(false);
    this.router.navigateByUrl(link);
  }

  logout(): void {
    this.profileOpen.set(false);
    this.auth.logout();
    // Spec: "Virtual RM conversation context ... invalidated on logout/expiry" — the
    // conversation singleton otherwise survives logout (it's providedIn: 'root'), which would
    // leak the previous session's chat into whoever logs in next.
    this.chatSession.resetChat();
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

// Combining diacritical marks block (U+0300-U+036F) — built from char codes rather than a
// literal escape so the accents don't sit invisibly in the source between the brackets.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Lowercases and strips Vietnamese diacritics so search matches regardless of accents. */
function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replace(/đ/g, 'd');
}
