import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { RmChatSessionService } from '../../features/virtual-rm/interaction/rm-chat-session.service';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

/** Generic 401/403 handling for every `/api/*` call (spec §29 — the interceptor is where this
 * belongs, not scattered per-page try/catch). `withCredentials: true` is set here rather than
 * per-call so the session cookie always rides along, including the documented cross-origin
 * split-deployment case (Angular served separately from the API — see
 * api-url.interceptor.ts's doc comment); same-origin dev (ng serve's proxy) doesn't need it but
 * is unaffected by it either. Angular's own `withXsrfConfiguration` (app.config.ts) already
 * attaches the CSRF header from the (non-HttpOnly) csrf_token cookie — nothing to do here for
 * that. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const chatSession = inject(RmChatSessionService);

  if (!req.url.startsWith('/api') || req.url === '/api/auth/login') {
    return next(req);
  }

  return next(req.clone({ withCredentials: true })).pipe(
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
