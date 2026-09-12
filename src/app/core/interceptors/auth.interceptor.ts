import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { RmChatSessionService } from '../../features/virtual-rm/interaction/rm-chat-session.service';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Generic 401/403 handling for every `/api/*` call (spec §29 — the interceptor is where this
 * belongs, not scattered per-page try/catch). `withCredentials: true` is set here rather than
 * per-call so the session cookie always rides along, including the documented cross-SITE
 * split-deployment case (Angular on GitHub Pages, API on a different registrable domain — see
 * api-url.interceptor.ts's doc comment).
 *
 * The `X-CSRF-Token` header is attached here from `AuthService.getCsrfToken()` (an in-memory
 * value populated from the login/me/keepalive response body) — NOT via Angular's
 * `withXsrfConfiguration`, which reads the token from `document.cookie` on the frontend's own
 * page. That only works when the `csrf_token` cookie's domain matches the page's domain, which
 * is false in the cross-site deployment above: a cookie set by the API's domain is never visible
 * to `document.cookie` on a page served from a different domain, no matter what CORS/SameSite
 * says. See `sessionPayload()`'s doc comment in the server's auth.controller.ts. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const chatSession = inject(RmChatSessionService);

  if (!req.url.startsWith('/api') || req.url === '/api/auth/login') {
    return next(req);
  }

  const csrfToken = auth.getCsrfToken();
  const withAuth = req.clone({
    withCredentials: true,
    ...(SAFE_METHODS.has(req.method) || !csrfToken ? {} : { setHeaders: { 'x-csrf-token': csrfToken } }),
  });

  return next(withAuth).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401 && auth.isAuthenticated()) {
          // The server has already decided the session is gone (expired/revoked/never
          // existed) — clear local state and send the customer back to /login. Navigating away
          // from the authenticated shell (app.component.html's `*ngIf="auth.isAuthenticated()"`)
          // also unmounts the Virtual RM launcher/chat page on its own.
          auth.clearLocalSession();
          chatSession.resetChat();
          toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
          void router.navigateByUrl('/login');
        } else if (err.status === 403) {
          toast.error('Anh/chị không có quyền thực hiện thao tác này.');
        }
      }
      return throwError(() => err);
    }),
  );
};
