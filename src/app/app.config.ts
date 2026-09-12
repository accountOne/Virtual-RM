import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { apiUrlInterceptor } from './core/interceptors/api-url.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    // Double-submit CSRF (spec §20) — auth.interceptor.ts attaches `x-csrf-token` from
    // AuthService's in-memory token, not Angular's `withXsrfConfiguration` (which reads
    // `document.cookie` and doesn't work once the API is on a different registrable domain than
    // the frontend, e.g. GitHub Pages + Render — see that interceptor's doc comment).
    provideHttpClient(withInterceptors([apiUrlInterceptor, authInterceptor])),
    // Login & Session Security upgrade (spec §9): resolve the real, server-derived
    // SecurityContext (GET /api/auth/me) BEFORE the router evaluates any guard, so a hard
    // refresh on an authenticated route doesn't bounce to /login while the check is still in
    // flight, and a genuinely expired session is caught immediately instead of flashing
    // authenticated content first.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
