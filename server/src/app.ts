import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './routes';
import { requireCsrf, requireSession, requireSessionReadOnly, stripIdentityOverrides } from './auth/session.middleware';

const CLIENT_DIST = path.join(__dirname, '..', '..', 'dist', 'client', 'browser');

function allowedOrigins(): string[] | boolean {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    // Demo default: the two local dev origins this repo's own `proxy.conf.json`/`ng serve`
    // setup actually uses. A real deployment MUST set ALLOWED_ORIGINS explicitly — see
    // docs/security/csrf-cors.md. Never falls back to `*` once credentials are involved.
    return ['http://localhost:4200', 'http://127.0.0.1:4200'];
  }
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export function createApp() {
  const app = express();

  // Security headers (spec §22). `crossOriginEmbedderPolicy`/`crossOriginResourcePolicy` are
  // relaxed off — this demo serves its own built Angular app from the same origin and doesn't
  // need cross-origin isolation, and turning them on has broken static-asset loading in past
  // Angular+helmet setups without adding real security value here.
  //
  // No `'unsafe-inline'` on `scriptSrc`/`scriptSrcAttr` — that would defeat CSP's actual
  // XSS-mitigation value (spec §22 exists specifically to block injected inline
  // scripts/handlers). `src/index.html` has exactly one pre-existing inline `<script>` (the
  // GitHub-Pages-redirect shim, unrelated to this security upgrade) — allow-listed by exact
  // SHA-256 hash below, which only that specific, developer-authored byte sequence can ever
  // match; a hash never permits attacker-injected inline script content. The `onload=` async
  // stylesheet-loading attribute Angular's build otherwise generates (`inlineCritical`, aka
  // Beasties) IS an inline event-handler and has no such hash-allowlist mechanism, so instead
  // of loosening `scriptSrcAttr` to `'unsafe-inline'`, that specific build optimization is
  // turned off in angular.json's production config (`optimization.styles.inlineCritical:
  // false`) — CSS just loads render-blocking instead, a negligible perf cost for a demo.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'sha256-OQsaOEQwd153s6YVXrFftfmEzgCq8Ot/BngiFUxYMj8='"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          // helmet defaults this directive on, which makes the browser silently rewrite every
          // same-origin fetch/XHR from http: to https: — fine behind real HTTPS, but this demo's
          // default deployment is plain HTTP (see COOKIE_SECURE's doc comment above), and a
          // server with no TLS listener then resets every rewritten request
          // (net::ERR_CONNECTION_RESET on every API call after page load, confirmed live).
          // Explicitly off here to match the demo's actual transport; a real HTTPS deployment
          // gets no benefit from this directive anyway once COOKIE_SECURE=true is set correctly.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Every other /api/* route requires a valid session. `/api/health` above already fully
  // handled its own request and never reaches this middleware; `/api/auth/login` is the one
  // *unhandled-yet* route that must stay reachable pre-session (there's no session to check
  // before it succeeds). `GET /api/auth/me` gets the read-only variant — the session-timeout
  // warning UX polls this endpoint, and a poll must not itself extend the idle timeout.
  app.use('/api', (req, res, next) => {
    if (req.path === '/auth/login') return next();
    if (req.path === '/auth/me' && req.method === 'GET') return requireSessionReadOnly(req, res, next);
    return requireSession(req, res, next);
  });
  // CSRF (spec §20) — also gated past /auth/login, which has no session yet to hold a token.
  // requireCsrf itself is a no-op for GET/HEAD/OPTIONS.
  app.use('/api', (req, res, next) => {
    if (req.path === '/auth/login') return next();
    return requireCsrf(req, res, next);
  });
  app.use('/api', stripIdentityOverrides);

  app.use('/api', apiRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'Not found' });
    }
    next();
  });

  // Serve the built Angular app (production: `npm run build && npm run build:server`).
  // In dev mode this directory doesn't exist yet — `npm run dev` serves the client via `ng serve` instead.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  // Never leak stack traces / internal details to the client (spec §28).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.' });
  });

  return app;
}
