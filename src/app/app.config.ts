import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { apiUrlInterceptor } from './core/interceptors/api-url.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(
      withInterceptors([apiUrlInterceptor, authInterceptor]),
      // Angular's built-in double-submit CSRF support (spec §20) — reads the non-HttpOnly
      // `csrf_token` cookie the server sets on login and echoes it back as `x-csrf-token` on
      // every state-changing request; matches server/src/auth/csrf.ts's cookie/header names.
      withXsrfConfiguration({ cookieName: 'csrf_token', headerName: 'x-csrf-token' }),
    ),
    // Login & Session Security upgrade (spec §9): resolve the real, server-derived
    // SecurityContext (GET /api/auth/me) BEFORE the router evaluates any guard, so a hard
    // refresh on an authenticated route doesn't bounce to /login while the check is still in
    // flight, and a genuinely expired session is caught immediately instead of flashing
    // authenticated content first.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
