import { Request, Response } from 'express';
import { logSecurityEvent } from '../auth/audit-log';
import { CSRF_COOKIE } from '../auth/csrf';
import { verifyPassword } from '../auth/password';
import { isLocked, recordFailedLogin, recordSuccessfulLogin } from '../auth/rate-limit';
import { cookieOptions, SESSION_COOKIE } from '../auth/session.middleware';
import {
  createSession,
  findByDisplayId,
  idleExpiresAt,
  listSessionsForUser,
  revokeAllForUser,
  revokeSession as revokeSessionRecord,
  toDisplayId,
} from '../auth/session-store';
import { SessionRecord } from '../auth/types';
import { companyIdForUser, findUser } from '../auth/user-store';

// Deliberately generic — spec §23: never reveal whether a username exists.
const GENERIC_LOGIN_ERROR = 'Thông tin đăng nhập không hợp lệ.';
const SESSION_INVALID_ERROR = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';

function readUserAgent(req: Request): string | undefined {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value : undefined;
}

/** Shared shape for `me()`/`login()`/`keepalive()` — the one place the frontend is meant to
 * read userId/companyId/role/session-expiry from (spec §9). */
function sessionPayload(session: SessionRecord) {
  return {
    authenticated: true as const,
    user: { id: session.userId, displayName: session.displayName, role: session.role },
    company: { id: session.companyId },
    session: {
      expiresAt: new Date(session.absoluteExpiresAt).toISOString(),
      idleExpiresAt: new Date(idleExpiresAt(session)).toISOString(),
    },
  };
}

export const authController = {
  /** POST /api/auth/login — spec §3. Never returns password/hash/session id/csrf secret in
   * the response body; those live only in the two cookies. */
  login(req: Request, res: Response) {
    const { username, password } = req.body as { username?: unknown; password?: unknown };
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ message: GENERIC_LOGIN_ERROR });
    }

    if (isLocked(username)) {
      logSecurityEvent('LOGIN_FAILED', { username, reason: 'LOCKED' });
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    const user = findUser(username);
    if (!user || !user.active) {
      recordFailedLogin(username);
      logSecurityEvent('LOGIN_FAILED', { username, reason: !user ? 'NO_SUCH_USER' : 'INACTIVE' });
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      recordFailedLogin(username);
      logSecurityEvent('LOGIN_FAILED', { username, reason: 'BAD_PASSWORD' });
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    recordSuccessfulLogin(username);
    const companyId = companyIdForUser(user);
    // Session fixation protection (spec §5): a brand-new opaque session id is minted here every
    // time, never reused/upgraded from anything the client had before login.
    const session = createSession({
      userId: user.username,
      companyId,
      role: user.role,
      displayName: user.displayName,
      userAgent: readUserAgent(req),
      ip: req.ip,
    });

    res.cookie(SESSION_COOKIE, session.sessionId, cookieOptions());
    // CSRF token cookie is intentionally NOT HttpOnly — the frontend must be able to read it
    // to echo it back in the X-CSRF-Token header (see csrf.ts's doc comment).
    res.cookie(CSRF_COOKIE, session.csrfToken, { ...cookieOptions(), httpOnly: false });

    logSecurityEvent('LOGIN_SUCCESS', { userId: user.username, role: user.role });

    res.json(sessionPayload(session));
  },

  /** POST /api/auth/logout — server-side invalidation, not just cookie clearing (spec §8). */
  logout(req: Request, res: Response) {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (typeof sessionId === 'string') {
      revokeSessionRecord(sessionId);
      logSecurityEvent('LOGOUT', { userId: req.session?.userId });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.clearCookie(CSRF_COOKIE, { ...cookieOptions(), httpOnly: false });
    res.json({ success: true });
  },

  /** GET /api/auth/me — spec §9. The only place the frontend is meant to read
   * userId/companyId/role from. Read-only (see `requireSessionReadOnly` in app.ts) — a
   * page-load or session-timeout-warning poll here must never itself extend the idle timeout. */
  me(req: Request, res: Response) {
    if (!req.session) return res.status(401).json({ authenticated: false });
    res.json(sessionPayload(req.session));
  },

  /** POST /api/auth/keepalive — what the "Tiếp tục phiên" (Continue) button on the
   * session-timeout warning calls. Goes through the normal (activity-touching) `requireSession`
   * middleware, so simply reaching this handler already extended the idle timeout; the absolute
   * timeout is never extended (spec §7 — "Continue" cannot bypass the hard absolute cap). */
  keepalive(req: Request, res: Response) {
    if (!req.session) return res.status(401).json({ message: SESSION_INVALID_ERROR });
    res.json(sessionPayload(req.session));
  },

  /** GET /api/auth/sessions — spec §24. Never exposes a raw session id, only a
   * non-reversible display id + device/browser/timestamps. */
  sessions(req: Request, res: Response) {
    if (!req.session) return res.status(401).json({ message: SESSION_INVALID_ERROR });
    const currentId = req.cookies?.[SESSION_COOKIE];
    const list = listSessionsForUser(req.session.userId).map((s) => ({
      id: toDisplayId(s.sessionId),
      isCurrent: s.sessionId === currentId,
      userAgent: s.userAgent,
      createdAt: new Date(s.createdAt).toISOString(),
      lastActivityAt: new Date(s.lastActivityAt).toISOString(),
    }));
    res.json(list);
  },

  /** POST /api/auth/sessions/:id/revoke — `:id` is the display id from sessions() above, not
   * a real session id. */
  revoke(req: Request, res: Response) {
    if (!req.session) return res.status(401).json({ message: SESSION_INVALID_ERROR });
    const target = findByDisplayId(req.session.userId, req.params.id);
    if (!target) return res.status(404).json({ message: 'Không tìm thấy phiên đăng nhập.' });
    const currentId = req.cookies?.[SESSION_COOKIE];
    const wasCurrent = target.sessionId === currentId;
    revokeSessionRecord(target.sessionId);
    logSecurityEvent('SESSION_REVOKED', { userId: req.session.userId, self: wasCurrent });
    if (wasCurrent) res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.json({ success: true });
  },

  /** POST /api/auth/sessions/revoke-all — every other session for this user; the caller's own
   * current session is deliberately kept (matches "logout all *other* devices" UX, spec §24). */
  revokeAll(req: Request, res: Response) {
    if (!req.session) return res.status(401).json({ message: SESSION_INVALID_ERROR });
    const currentId = req.cookies?.[SESSION_COOKIE];
    const count = revokeAllForUser(req.session.userId, currentId);
    logSecurityEvent('SESSION_REVOKED', { userId: req.session.userId, count, scope: 'ALL_EXCEPT_CURRENT' });
    res.json({ success: true, revokedCount: count });
  },
};
