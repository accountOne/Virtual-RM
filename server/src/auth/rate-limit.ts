// Rate limiting & brute-force protection — spec §23. Two layers:
//   1. `express-rate-limit` request-count limiters per IP for login, Virtual RM queries, and
//      transaction-mutating routes.
//   2. A custom per-username failed-login lockout (`recordFailedLogin`/`isLocked`) — a pure
//      per-IP request-rate limiter alone doesn't stop a distributed brute force against one
//      account, so this tracks failures by *username* regardless of source IP.
import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';

function flag(envVar: string, defaultOn: boolean): boolean {
  const raw = process.env[envVar];
  if (raw === undefined) return defaultOn;
  return raw !== 'false';
}

/** A middleware that never blocks — used when the corresponding RATE_LIMIT_* flag is off, so
 * callers don't need an `if (enabled) app.use(...)` branch at every mount point. */
const noopMiddleware: RequestHandler = (_req, _res, next) => next();

export const loginRateLimiter: RequestHandler = flag('RATE_LIMIT_LOGIN', true)
  ? rateLimit({
      windowMs: 15 * 60_000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ít phút.' },
    })
  : noopMiddleware;

export const virtualRmRateLimiter: RequestHandler = flag('RATE_LIMIT_VIRTUAL_RM', true)
  ? rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
    })
  : noopMiddleware;

export const transactionRateLimiter: RequestHandler = flag('RATE_LIMIT_TRANSACTIONS', true)
  ? rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
    })
  : noopMiddleware;

// ---- Per-username failed-login lockout --------------------------------------------------

interface LockoutState {
  failCount: number;
  lockedUntil?: number;
}

const LOCKOUT_THRESHOLD = Number(process.env.LOGIN_LOCKOUT_THRESHOLD) || 5;
const LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15;

const lockouts = new Map<string, LockoutState>();

function key(username: string): string {
  return username.trim().toLowerCase();
}

export function isLocked(username: string): boolean {
  const state = lockouts.get(key(username));
  if (!state?.lockedUntil) return false;
  if (Date.now() > state.lockedUntil) {
    lockouts.delete(key(username));
    return false;
  }
  return true;
}

export function recordFailedLogin(username: string): void {
  const k = key(username);
  const state = lockouts.get(k) ?? { failCount: 0 };
  state.failCount += 1;
  if (state.failCount >= LOCKOUT_THRESHOLD) {
    state.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60_000;
  }
  lockouts.set(k, state);
}

export function recordSuccessfulLogin(username: string): void {
  lockouts.delete(key(username));
}

export function _debugClearLockouts(): void {
  lockouts.clear();
}

export function _debugSetLockoutThreshold(): number {
  return LOCKOUT_THRESHOLD;
}
