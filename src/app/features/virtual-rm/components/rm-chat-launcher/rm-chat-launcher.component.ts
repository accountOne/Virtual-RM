import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { RmChatSessionService } from '../../interaction/rm-chat-session.service';

const BUTTON_SIZE = 56;
const EDGE_MARGIN = 8;
const DRAG_THRESHOLD = 6;
const POS_STORAGE_KEY = 'vrm_widget_pos';
const CHAT_ROUTE = '/virtual-rm/chat';

interface Point {
  x: number;
  y: number;
}

/**
 * Floating chat launcher (UI feedback round) — clarifies the previous full-screen redesign:
 * the customer still wants a persistent, draggable floating bubble as the entry point (like the
 * old `rm-widget.component.ts`'s mobile button), it's just that tapping it now expands straight
 * into the full-screen `/virtual-rm/chat` page instead of a small popup panel. Drag mechanics
 * are the same ones `rm-widget.component.ts` used (pointer capture, edge clamping, localStorage
 * position) — this component only keeps the "floating button" half of it; the popup/teaser/
 * bottom-sheet half is gone for good (see docs/phase-5.6-full-screen-redesign.md).
 *
 * Rendered everywhere (desktop and mobile alike, unlike the old widget's mobile-only button —
 * there's no more persistent desktop panel to make it redundant), and hides itself while the
 * customer is already on the full-screen chat page.
 */
@Component({
  selector: 'app-rm-chat-launcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      *ngIf="!onChatPage()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      class="fixed z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-pop flex items-center justify-center text-2xl select-none touch-none"
      [class.right-5]="!buttonPos()"
      [class.bottom-5]="!buttonPos()"
      [style.left.px]="buttonPos()?.x ?? null"
      [style.top.px]="buttonPos()?.y ?? null"
      [attr.aria-label]="unreadCount() > 0 ? 'Mở Trợ lý RM ảo, ' + unreadCount() + ' tin nhắn chưa đọc (giữ để kéo di chuyển)' : 'Mở Trợ lý RM ảo (giữ để kéo di chuyển)'"
    >
      👩‍💼
      <span
        *ngIf="unreadCount() > 0"
        class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-negative text-white text-[10px] font-semibold leading-none flex items-center justify-center ring-2 ring-white"
        aria-hidden="true"
      >{{ unreadCount() > 9 ? '9+' : unreadCount() }}</span>
    </button>
  `,
})
export class RmChatLauncherComponent {
  private readonly router = inject(Router);
  private readonly session = inject(RmChatSessionService);
  readonly unreadCount = this.session.unreadCount;

  readonly buttonPos = signal<Point | null>(restorePos());
  readonly onChatPage = signal(this.router.url.startsWith(CHAT_ROUTE));

  private dragging = false;
  private moved = false;
  private lastX = 0;
  private lastY = 0;

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.onChatPage.set(e.urlAfterRedirects.startsWith(CHAT_ROUTE));
    });
  }

  /** Bug: a position saved on a wider viewport (or before a mobile browser's address bar
   * collapsed/expanded, or a device rotation) was only ever re-clamped once, at construction time
   * — resizing the same already-loaded page (no full reload) left the stored absolute px position
   * unchanged, so the button could end up partly or fully off-screen. Re-clamp on every resize,
   * but only when a custom (dragged) position is actually set — the "no custom position" default
   * already tracks the viewport for free via the right-5/bottom-5 CSS classes. */
  @HostListener('window:resize')
  onWindowResize(): void {
    const pos = this.buttonPos();
    if (!pos) return;
    const clamped = clamp(pos);
    this.buttonPos.set(clamped);
    persistPos(clamped);
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
      // A tap, not a drag — expand into the full-screen chat.
      void this.router.navigateByUrl(CHAT_ROUTE);
    }
  }
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
