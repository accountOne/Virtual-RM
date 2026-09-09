import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatUiService } from '../../../../core/services/chat-ui.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { VndShortPipe } from '../../../../shared/pipes/vnd.pipe';
import { RmChatComponent } from '../rm-chat/rm-chat.component';

const BUTTON_SIZE = 56;
const EDGE_MARGIN = 8;
const DRAG_THRESHOLD = 6;
const POS_STORAGE_KEY = 'vrm_widget_pos';

interface Point {
  x: number;
  y: number;
}

@Component({
  selector: 'app-rm-widget',
  standalone: true,
  imports: [CommonModule, RouterLink, VndShortPipe, RmChatComponent],
  template: `
    <!-- Desktop persistent panel -->
    <aside class="hidden lg:flex lg:flex-col w-[320px] shrink-0 border-l border-ink-100 bg-white h-[calc(100vh-4rem)] sticky top-16">
      <ng-container *ngTemplateOutlet="panelContent"></ng-container>
    </aside>

    <!-- Mobile floating button — drag anywhere within the viewport; tap (no drag) opens the widget -->
    <button
      *ngIf="!chatUi.mobileSheetOpen()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      class="lg:hidden fixed z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-pop flex items-center justify-center text-2xl select-none touch-none"
      [class.right-5]="!buttonPos()"
      [class.bottom-5]="!buttonPos()"
      [style.left.px]="buttonPos()?.x ?? null"
      [style.top.px]="buttonPos()?.y ?? null"
      aria-label="Mở Virtual RM (giữ để kéo di chuyển)"
    >
      👩‍💼
    </button>

    <!-- Mobile bottom sheet — fixed height (half the viewport) so the input never gets
         pushed off-screen by a long conversation; messages scroll internally instead. -->
    <div
      *ngIf="chatUi.mobileSheetOpen()"
      class="lg:hidden fixed inset-0 z-40 bg-ink-900/40 touch-none"
      (click)="chatUi.closeMobileSheet()"
    ></div>
    <div
      class="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-pop h-[50vh] flex flex-col overflow-hidden overscroll-contain transition-transform duration-200"
      [class.translate-y-full]="!chatUi.mobileSheetOpen()"
    >
      <div class="flex justify-center pt-2 shrink-0">
        <div class="w-10 h-1 rounded-full bg-ink-200"></div>
      </div>
      <div class="flex items-center justify-between px-4 pt-2 shrink-0">
        <span class="text-sm font-semibold text-ink-800">Virtual RM</span>
        <button class="text-ink-400 p-1" (click)="chatUi.closeMobileSheet()">✕</button>
      </div>
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ng-container *ngTemplateOutlet="panelContent"></ng-container>
      </div>
    </div>

    <ng-template #panelContent>
      <div class="flex items-center gap-3 px-4 py-4 border-b border-ink-100 shrink-0">
        <div class="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-xl">👩‍💼</div>
        <div>
          <p class="text-sm font-semibold text-ink-800">Virtual RM</p>
          <p class="text-xs text-positive flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-positive inline-block"></span> Đang hoạt động
          </p>
        </div>
      </div>

      <ng-container *ngIf="!chatUi.chatMode(); else chatView">
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
          <p class="text-sm text-ink-600 leading-relaxed">{{ rmData.briefing()?.greeting }}</p>

          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg bg-ink-50 px-2 py-2.5 text-center">
              <p class="text-[10px] text-ink-400">Số dư</p>
              <p class="text-xs font-semibold text-ink-800">{{ rmData.briefing()?.balance | vndShort }}</p>
            </div>
            <div class="rounded-lg bg-ink-50 px-2 py-2.5 text-center">
              <p class="text-[10px] text-ink-400">Việc cần làm</p>
              <p class="text-xs font-semibold text-ink-800">{{ rmData.openTasks().length }}</p>
            </div>
            <div class="rounded-lg bg-ink-50 px-2 py-2.5 text-center">
              <p class="text-[10px] text-ink-400">Cảnh báo</p>
              <p class="text-xs font-semibold text-ink-800">{{ rmData.alerts().length }}</p>
            </div>
          </div>

          <div *ngIf="rmData.briefing()?.insight as insight" class="rounded-lg bg-brand-50 px-3 py-2.5">
            <p class="text-xs font-semibold text-brand-700 mb-0.5">💡 RM Insight</p>
            <p class="text-xs text-brand-700 leading-relaxed">{{ insight.message }}</p>
          </div>

          <a
            routerLink="/virtual-rm"
            (click)="chatUi.closeMobileSheet()"
            class="block text-center text-xs font-medium text-brand-600 hover:underline"
          >
            Xem toàn bộ Virtual RM Dashboard →
          </a>
        </div>

        <div class="p-4 border-t border-ink-100 shrink-0">
          <button class="btn-primary w-full" (click)="chatUi.chatMode.set(true)">💬 Hỏi Virtual RM</button>
        </div>
      </ng-container>

      <ng-template #chatView>
        <div class="px-4 py-2 border-b border-ink-100 shrink-0">
          <button class="text-xs text-ink-500 hover:text-ink-700" (click)="chatUi.showTeaser()">← Quay lại</button>
        </div>
        <div class="flex-1 min-h-0 flex flex-col">
          <app-rm-chat class="h-full block" />
        </div>
      </ng-template>
    </ng-template>
  `,
})
export class RmWidgetComponent {
  readonly rmData = inject(RmDataService);
  readonly chatUi = inject(ChatUiService);

  readonly buttonPos = signal<Point | null>(restorePos());

  private dragging = false;
  private moved = false;
  private lastX = 0;
  private lastY = 0;

  constructor() {
    // Lock body scroll while the mobile bottom sheet is open so a swipe inside it
    // doesn't also scroll the page behind it. Only applies below the `lg` breakpoint —
    // openChat()/openTeaser() can be triggered from desktop too, where the sheet stays
    // hidden and the page should keep scrolling normally.
    effect(() => {
      const shouldLock = isMobileViewport() && this.chatUi.mobileSheetOpen();
      document.body.style.overflow = shouldLock ? 'hidden' : '';
    });
  }

  onPointerDown(ev: PointerEvent): void {
    this.dragging = true;
    this.moved = false;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.dragging) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    if (!this.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    this.moved = true;

    const base = this.buttonPos() ?? defaultPos();
    const next = clamp({ x: base.x + dx, y: base.y + dy });
    this.buttonPos.set(next);
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
  }

  onPointerUp(_ev: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;

    if (this.moved) {
      const pos = this.buttonPos();
      if (pos) persistPos(pos);
    } else {
      // A tap, not a drag — open the widget.
      this.chatUi.openTeaser();
    }
  }
}

/** Matches Tailwind's `lg` breakpoint (1024px) used for `lg:hidden` on the mobile sheet. */
function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 1023.98px)').matches;
}

function defaultPos(): Point {
  return {
    x: window.innerWidth - BUTTON_SIZE - 20,
    y: window.innerHeight - BUTTON_SIZE - 20,
  };
}

function clamp(pos: Point): Point {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(EDGE_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(EDGE_MARGIN, pos.y), maxY),
  };
}

function restorePos(): Point | null {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    return clamp(JSON.parse(raw) as Point);
  } catch {
    return null;
  }
}

function persistPos(pos: Point): void {
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // ignore — position just won't persist across reloads
  }
}
