// Express middleware enforcing the session (spec §6/§9/§10/§20). This is the one place a
// request gets `req.session` (the authenticated `SessionRecord`) attached — every downstream
// controller reads identity from here, never from the request body/query.
import { NextFunction, Request, Response } from 'express';
import { logSecurityEvent } from './audit-log';
import { CSRF_HEADER, validateCsrf } from './csrf';
import { peekSession, touchSession } from './session-store';
import { Role, SessionRecord } from './types';

export const SESSION_COOKIE = 'session_id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionRecord;
    }
  }
}

export function cookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
} {
  return {
    httpOnly: true,
    // Demo default is plain HTTP on localhost — a `Secure` cookie is silently dropped by the
    // browser over HTTP, which would break login entirely. Production deployment behind HTTPS
    // must set COOKIE_SECURE=true explicitly (see .env.example / docs/security/session-management.md).
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax',
    path: '/',
  };
}

const GENERIC_401 = { message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' };
const GENERIC_403 = { message: 'Anh/chị không có quyền thực hiện thao tác này.' };

/** Mounted on every `/api/*` route except `/api/health` and `POST /api/auth/login` (spec §9:
 * "Frontend phải lấy security context từ endpoint này" — this middleware is what makes that
 * true for every other endpoint too). */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(401).json(GENERIC_401);
    return;
  }
  const result = touchSession(sessionId);
  if (!result.ok) {
    if (result.reason !== 'NOT_FOUND') {
      logSecurityEvent('SESSION_EXPIRED', { reason: result.reason, path: req.path });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(401).json(GENERIC_401);
    return;
  }
  req.session = result.session;
  next();
}

/** Read-only variant for `GET /api/auth/me` specifically (spec §6/§9): a page-load/poll-driven
 * check of "am I still logged in" must not itself count as the activity that keeps extending
 * the idle timeout, or the idle timeout could never fire while a tab is merely open (the exact
 * failure mode spec §34 rejects). Uses `peekSession` instead of `touchSession` — same
 * validation, no side effect. Anything that should genuinely extend the session (a real
 * business API call, or the explicit `POST /api/auth/keepalive` the "Tiếp tục phiên" button
 * calls) still goes through `requireSession` above. */
export function requireSessionReadOnly(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(401).json(GENERIC_401);
    return;
  }
  const result = peekSession(sessionId);
  if (!result.ok) {
    if (result.reason !== 'NOT_FOUND') {
      logSecurityEvent('SESSION_EXPIRED', { reason: result.reason, path: req.path });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(401).json(GENERIC_401);
    return;
  }
  req.session = result.session;
  next();
}

/** Role check — must run after `requireSession`. Fails closed (401) if somehow called first. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json(GENERIC_401);
      return;
    }
    if (!roles.includes(req.session.role)) {
      logSecurityEvent('AUTHORIZATION_DENIED', {
        userId: req.session.userId,
        role: req.session.role,
        path: req.path,
        requiredRoles: roles,
      });
      res.status(403).json(GENERIC_403);
      return;
    }
    next();
  };
}

/** Double-submit CSRF check for state-changing verbs — spec §20. GET/HEAD/OPTIONS are always
 * read-only in this API (spec: "GET phải read-only. Không dùng GET để thực hiện transaction"),
 * so they're exempt by construction, not by allowlist. Must run after `requireSession`. */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  if (!req.session) {
    res.status(401).json(GENERIC_401);
    return;
  }
  const header = req.headers[CSRF_HEADER];
  if (!validateCsrf(req.session, header)) {
    logSecurityEvent('SUSPICIOUS_REQUEST', { userId: req.session.userId, path: req.path, reason: 'CSRF_TOKEN_MISMATCH' });
    res.status(403).json({ message: 'Yêu cầu không hợp lệ.' });
    return;
  }
  next();
}

/** Defense-in-depth: if a client still sends `companyId`/`userId`/`role` in the body/query of
 * an authenticated request (old frontend code, a compromised client, or a crafted request),
 * this proves — and audits — that it can never take effect. Session values always win; the
 * offending fields are stripped, not merely ignored, so a handler that destructures `req.body`
 * further downstream cannot accidentally pick them back up. Spec §10/§11: "Server MUST enforce
 * companyId = session.companyId." */
export function stripIdentityOverrides(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session) return next();
  const suspiciousFields = ['companyId', 'userId', 'role'] as const;
  for (const source of [req.body, req.query] as Record<string, unknown>[]) {
    if (!source || typeof source !== 'object') continue;
    for (const field of suspiciousFields) {
      if (field in source) {
        const attempted = source[field];
        const real = field === 'role' ? req.session.role : field === 'userId' ? req.session.userId : req.session.companyId;
        if (attempted !== real) {
          logSecurityEvent('SUSPICIOUS_REQUEST', {
            userId: req.session.userId,
            path: req.path,
            reason: 'IDENTITY_OVERRIDE_ATTEMPT',
            field,
            attempted,
          });
        }
        delete source[field];
      }
    }
  }
  next();
}
