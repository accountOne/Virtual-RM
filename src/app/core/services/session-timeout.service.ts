import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RmChatSessionService } from '../../features/virtual-rm/interaction/rm-chat-session.service';
import { AuthService } from './auth.service';
import { ConfirmDialogService } from './confirm-dialog.service';

/** How often to re-check the session's true idle expiry against the server (spec §6/§7). Polls
 * the read-only `GET /api/auth/me` (`requireSessionReadOnly` server-side) so the check itself
 * never extends the idle timeout — only genuine business API calls do that. */
const POLL_INTERVAL_MS = 30_000;

/** Show the "sắp hết hạn" warning this far ahead of idle expiry (spec: "~2 phút trước"). */
const WARNING_WINDOW_MS = 2 * 60_000;

/**
 * Pre-expiry session warning UX (spec §7): "Phiên đăng nhập sắp hết hạn" with
 * Continue/Logout — reuses the app's existing generic `ConfirmDialogService` rather than a new
 * dialog component, matching the rest of the app's confirm-prompt pattern (see
 * confirm-dialog.component.ts). "Continue" extends the idle timeout via
 * `POST /api/auth/keepalive`; the absolute timeout is never extended and still fires
 * regardless (enforced server-side in `session-store.ts::touchSession`).
 *
 * Instantiated once, eagerly, at app root (see app.component.ts) — same lifecycle pattern as
 * `RmChatSessionService`.
 */
@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly auth = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly chatSession = inject(RmChatSessionService);

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private warningShown = false;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  private start(): void {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  private stop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.warningShown = false;
  }

  private async tick(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    await this.auth.restoreSession();
    // Already expired/revoked by the time we polled — the auth interceptor's 401 handling
    // (clear state, toast, redirect to /login) has already run as a side effect of that call.
    if (!this.auth.isAuthenticated()) return;

    const idleExpiresAt = this.auth.sessionIdleExpiresAt();
    if (!idleExpiresAt) return;
    const msLeft = idleExpiresAt.getTime() - Date.now();

    if (msLeft <= WARNING_WINDOW_MS) {
      if (!this.warningShown) {
        this.warningShown = true;
        void this.showWarning();
      }
    } else {
      this.warningShown = false;
    }
  }

  private async showWarning(): Promise<void> {
    const shouldContinue = await this.confirmDialog.ask({
      title: 'Phiên đăng nhập sắp hết hạn',
      message:
        'Anh/chị chưa có thao tác nào trong một khoảng thời gian và sắp bị đăng xuất tự động. Anh/chị muốn tiếp tục phiên làm việc không?',
      confirmLabel: 'Tiếp tục phiên',
      cancelLabel: 'Đăng xuất',
    });
    this.warningShown = false;
    // Expired, or logged out from another tab, while the dialog was open.
    if (!this.auth.isAuthenticated()) return;
    if (shouldContinue) {
      // A failure here (session already gone server-side) is handled by the auth interceptor's
      // 401 path (clear state + toast + redirect) — nothing extra to do on this end.
      await this.auth.keepAlive();
    } else {
      this.auth.logout();
      this.chatSession.resetChat();
      void this.router.navigateByUrl('/login');
    }
  }
}
