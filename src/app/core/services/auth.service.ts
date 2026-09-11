import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type UserRole = 'MAKER' | 'CHECKER' | 'ADMIN';

export interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  MAKER: 'Maker — Người lập lệnh',
  CHECKER: 'Checker — Người phê duyệt',
  ADMIN: 'Admin — Quản trị viên',
};

interface SessionApiResponse {
  authenticated: boolean;
  user?: { id: string; displayName: string; role: UserRole };
  company?: { id: string };
  session?: { expiresAt: string; idleExpiresAt: string };
}

export type LoginResult = { ok: true } | { ok: false; message: string };

const GENERIC_LOGIN_ERROR = 'Không thể đăng nhập. Vui lòng thử lại.';

/**
 * Login & Session Security upgrade — identity now comes exclusively from the server's
 * authenticated session (HttpOnly cookie + `GET /api/auth/me`), never from
 * localStorage/sessionStorage (spec §3/§9: "Frontend phải lấy security context từ endpoint
 * này"). This service just mirrors whatever the server says into signals; it never invents,
 * caches, or persists identity itself — a hard refresh re-derives everything from the cookie
 * via `restoreSession()` (see app.config.ts's app initializer).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<AuthUser | null>(null);
  readonly companyId = signal<string | null>(null);
  readonly sessionExpiresAt = signal<Date | null>(null);
  readonly sessionIdleExpiresAt = signal<Date | null>(null);
  /** Flips true once the initial `GET /api/auth/me` bootstrap check has resolved, either way —
   * guards run after this, so a real, still-valid session survives a hard refresh instead of
   * bouncing to /login before the check completes. */
  readonly initialized = signal(false);

  /** Called once at app bootstrap (see app.config.ts's `provideAppInitializer`). Read-only on
   * the server (see `requireSessionReadOnly` in server/src/app.ts) — restoring on refresh must
   * not itself count as session activity. */
  async restoreSession(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<SessionApiResponse>('/api/auth/me'));
      this.applySession(res);
    } catch {
      this.clear();
    } finally {
      this.initialized.set(true);
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const res = await firstValueFrom(
        this.http.post<SessionApiResponse>('/api/auth/login', { username, password }),
      );
      this.applySession(res);
      return { ok: true };
    } catch (err) {
      this.clear();
      return { ok: false, message: extractMessage(err) };
    }
  }

  /** Clears local state immediately for instant UX, then tells the server in the background —
   * spec §5/§8: logout must invalidate the session server-side, not just forget it client-side. */
  logout(): void {
    this.clear();
    void firstValueFrom(this.http.post('/api/auth/logout', {})).catch(() => {});
  }

  /** What the session-timeout warning's "Tiếp tục phiên" button calls — extends the idle
   * timeout (never the absolute one) and refreshes the expiry signals used to re-arm the
   * warning. Returns false if the session had already expired server-side by the time the
   * user clicked Continue. */
  async keepAlive(): Promise<boolean> {
    try {
      const res = await firstValueFrom(this.http.post<SessionApiResponse>('/api/auth/keepalive', {}));
      this.applySession(res);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  /** Called by `auth.interceptor.ts` on a 401 from any API call — the server has already
   * decided the session is gone (expired/revoked), so there is nothing left to invalidate
   * server-side; this just makes the frontend's state match reality immediately. */
  clearLocalSession(): void {
    this.clear();
  }

  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  hasRole(...roles: UserRole[]): boolean {
    const user = this.currentUser();
    return !!user && roles.includes(user.role);
  }

  private applySession(res: SessionApiResponse): void {
    if (!res.authenticated || !res.user) {
      this.clear();
      return;
    }
    this.currentUser.set({ username: res.user.id, role: res.user.role, displayName: res.user.displayName });
    this.companyId.set(res.company?.id ?? null);
    this.sessionExpiresAt.set(res.session ? new Date(res.session.expiresAt) : null);
    this.sessionIdleExpiresAt.set(res.session ? new Date(res.session.idleExpiresAt) : null);
  }

  private clear(): void {
    this.currentUser.set(null);
    this.companyId.set(null);
    this.sessionExpiresAt.set(null);
    this.sessionIdleExpiresAt.set(null);
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: unknown } | null;
    if (body && typeof body.message === 'string') return body.message;
  }
  return GENERIC_LOGIN_ERROR;
}
