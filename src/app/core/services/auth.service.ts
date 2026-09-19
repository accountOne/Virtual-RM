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
  csrfToken?: string;
  session?: { expiresAt: string; idleExpiresAt: string };
}

export type LoginResult = { ok: true } | { ok: false; message: string };

const GENERIC_LOGIN_ERROR = 'Không thể đăng nhập. Vui lòng thử lại.';
// Voice UX upgrade — scopes "has the daily briefing already been spoken this login session"
// (docs/virtual-rm-voice-design.md §11) to a genuine fresh login, not just a page load. Kept in
// sessionStorage (not a new field on the server's own session payload — the server doesn't need
// to know about this, it's a pure frontend voice-UX concern) so a page refresh reuses the same id
// (the underlying httpOnly session cookie is unchanged), while an explicit logout+login again —
// even within the same browser tab — gets a fresh one.
const LOGIN_SESSION_ID_KEY = 'vrm_login_session_id';

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
  /** In-memory CSRF token, read by `auth.interceptor.ts` to attach `X-CSRF-Token` directly —
   * NOT read from `document.cookie` (Angular's `withXsrfConfiguration`). That cookie-reading
   * approach only works when the `csrf_token` cookie's domain matches the page's own domain —
   * true for same-origin dev, but false for this app's cross-SITE split-deployment case
   * (Angular on GitHub Pages, API on a different registrable domain like Render): a cookie set
   * by the API's domain is never visible to `document.cookie` on the GitHub Pages page,
   * regardless of SameSite. See `sessionPayload()` in the server's auth.controller.ts. */
  private csrfToken: string | null = null;
  /** Flips true once the initial `GET /api/auth/me` bootstrap check has resolved, either way —
   * guards run after this, so a real, still-valid session survives a hard refresh instead of
   * bouncing to /login before the check completes. */
  readonly initialized = signal(false);
  /** See LOGIN_SESSION_ID_KEY above — null when logged out. */
  readonly loginSessionId = signal<string | null>(null);

  /** Called once at app bootstrap (see app.config.ts's `provideAppInitializer`). Read-only on
   * the server (see `requireSessionReadOnly` in server/src/app.ts) — restoring on refresh must
   * not itself count as session activity. */
  async restoreSession(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<SessionApiResponse>('/api/auth/me'));
      this.applySession(res);
      if (res.authenticated) this.ensureLoginSessionId();
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
      // Unlike restoreSession()'s reuse-if-present above, an explicit login is always a genuinely
      // NEW session even if one was already sitting in sessionStorage (e.g. logout then log back
      // in within the same tab) — the daily briefing must be allowed to speak again.
      this.regenerateLoginSessionId();
      return { ok: true };
    } catch (err) {
      this.clear();
      return { ok: false, message: extractMessage(err) };
    }
  }

  /** Page refresh reuses the same id (the underlying session cookie didn't change); first load
   * in a fresh tab creates one. */
  private ensureLoginSessionId(): void {
    if (this.loginSessionId()) return;
    try {
      const existing = sessionStorage.getItem(LOGIN_SESSION_ID_KEY);
      this.loginSessionId.set(existing ?? this.regenerateLoginSessionId());
    } catch {
      this.loginSessionId.set(cryptoRandomId());
    }
  }

  private regenerateLoginSessionId(): string {
    const id = cryptoRandomId();
    this.loginSessionId.set(id);
    try {
      sessionStorage.setItem(LOGIN_SESSION_ID_KEY, id);
    } catch {
      // ignore — voice daily-briefing dedup just won't survive a refresh this session
    }
    return id;
  }

  /** Tells the server first, then clears local state — in that order. `firstValueFrom` subscribes
   * (and so runs auth.interceptor.ts, which reads `getCsrfToken()` to attach `X-CSRF-Token`)
   * synchronously the instant it's called; clearing `csrfToken` to null before that, as this used
   * to, made the interceptor send the logout POST with no CSRF header at all, so the request that
   * actually invalidates the session failed its own CSRF check with 403 — surfaced to the
   * customer, right after logging out, as "Anh/chị không có quyền thực hiện thao tác này."
   * (confirmed live). Reordering costs nothing UX-wise (`clear()` still runs in the same tick). */
  logout(): void {
    void firstValueFrom(this.http.post('/api/auth/logout', {})).catch(() => {});
    this.clear();
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

  /** Read by `auth.interceptor.ts` to attach `X-CSRF-Token`. `null` before the first successful
   * login/restoreSession, or after logout/clear. */
  getCsrfToken(): string | null {
    return this.csrfToken;
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
    this.csrfToken = res.csrfToken ?? null;
    this.sessionExpiresAt.set(res.session ? new Date(res.session.expiresAt) : null);
    this.sessionIdleExpiresAt.set(res.session ? new Date(res.session.idleExpiresAt) : null);
  }

  private clear(): void {
    this.currentUser.set(null);
    this.companyId.set(null);
    this.csrfToken = null;
    this.sessionExpiresAt.set(null);
    this.sessionIdleExpiresAt.set(null);
    this.loginSessionId.set(null);
    try {
      sessionStorage.removeItem(LOGIN_SESSION_ID_KEY);
    } catch {
      // ignore
    }
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extractMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: unknown } | null;
    if (body && typeof body.message === 'string') return body.message;
  }
  return GENERIC_LOGIN_ERROR;
}
