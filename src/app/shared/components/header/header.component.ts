import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
        <button class="relative text-ink-500 hover:text-ink-700 p-1" aria-label="Thông báo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <span
            *ngIf="rmData.alerts().length > 0"
            class="absolute -top-1 -right-1 bg-negative text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center"
          >{{ rmData.alerts().length }}</span>
        </button>
        <div class="flex items-center gap-2 pl-3 border-l border-ink-100">
          <div class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
            {{ initials() }}
          </div>
          <div class="hidden sm:block leading-tight">
            <p class="text-sm font-medium text-ink-800">{{ rmData.customer()?.companyName || '...' }}</p>
            <p class="text-xs text-ink-400">{{ rmData.customer()?.segment }}</p>
          </div>
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  readonly rmData = inject(RmDataService);
  @Output() menuToggle = new EventEmitter<void>();

  initials(): string {
    const name = this.rmData.customer()?.companyName ?? '';
    return name
      .split(' ')
      .filter((w) => /^[A-ZÀ-Ỹ]/.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join('') || 'AB';
  }
}
