// In-memory server-side session store (Login & Session Security upgrade — see
// docs/security/session-management.md). Demo-appropriate: a real deployment would back this
// with Redis/a database so sessions survive a process restart and work across multiple server
// instances, but the shape (opaque id -> record, idle/absolute timeout, explicit
// create/touch/revoke) is exactly what that swap would keep.
import crypto from 'crypto';
import { Role, SessionRecord } from './types';

function readIdleTimeoutMs(): number {
  const minutes = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60_000;
}

function readAbsoluteTimeoutMs(): number {
  const hours = Number(process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 3_600_000;
}

let idleTimeoutMs = readIdleTimeoutMs();
let absoluteTimeoutMs = readAbsoluteTimeoutMs();

/** Test-only override — production/dev always derive timeouts from
 * SESSION_IDLE_TIMEOUT_MINUTES/SESSION_ABSOLUTE_TIMEOUT_HOURS at module load. Security tests
 * need sub-second timeouts to actually exercise expiry without sleeping for real minutes. */
export function _debugConfigureTimeouts(opts: { idleMs?: number; absoluteMs?: number }): void {
  if (opts.idleMs !== undefined) idleTimeoutMs = opts.idleMs;
  if (opts.absoluteMs !== undefined) absoluteTimeoutMs = opts.absoluteMs;
}

export function _debugResetTimeoutsFromEnv(): void {
  idleTimeoutMs = readIdleTimeoutMs();
  absoluteTimeoutMs = readAbsoluteTimeoutMs();
}

const sessions = new Map<string, SessionRecord>();

function newOpaqueId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface CreateSessionInput {
  userId: string;
  companyId: string;
  role: Role;
  displayName: string;
  userAgent?: string;
  ip?: string;
}

/** Always mints a brand-new session id — never reuses/upgrades a pre-login session id (spec
 * §5, session fixation protection). There is no pre-auth "anonymous session" in this app at
 * all today, which already avoids the classic fixation vector (an attacker priming a known
 * session id before the victim logs into it); this function's contract holds either way. */
export function createSession(input: CreateSessionInput): SessionRecord {
  const now = Date.now();
  const record: SessionRecord = {
    sessionId: newOpaqueId(),
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    displayName: input.displayName,
    csrfToken: newOpaqueId(),
    createdAt: now,
    lastActivityAt: now,
    absoluteExpiresAt: now + absoluteTimeoutMs,
    userAgent: input.userAgent,
    ip: input.ip,
  };
  sessions.set(record.sessionId, record);
  return record;
}

export type SessionLookupResult =
  | { ok: true; session: SessionRecord }
  | { ok: false; reason: 'NOT_FOUND' | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED' };

/** Validates a session id and, if still valid, refreshes `lastActivityAt` — the one place
 * idle/absolute timeout are enforced (spec §6: "Mỗi authenticated request: 1. Validate
 * session. 2. Check absolute expiry. 3. Check idle expiry. 4. Update lastActivity"). An
 * expired session is deleted from the store immediately, not just rejected. */
export function touchSession(sessionId: string): SessionLookupResult {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, reason: 'NOT_FOUND' };
  const now = Date.now();
  if (now > session.absoluteExpiresAt) {
    sessions.delete(sessionId);
    return { ok: false, reason: 'ABSOLUTE_EXPIRED' };
  }
  if (now - session.lastActivityAt > idleTimeoutMs) {
    sessions.delete(sessionId);
    return { ok: false, reason: 'IDLE_EXPIRED' };
  }
  session.lastActivityAt = now;
  return { ok: true, session };
}

/** Read without side effects (no activity touch) — used for `/api/auth/me`-style checks where
 * a plain page-load-driven poll shouldn't itself count as "activity" that keeps extending idle
 * timeout forever. Still enforces both timeouts. */
export function peekSession(sessionId: string): SessionLookupResult {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, reason: 'NOT_FOUND' };
  const now = Date.now();
  if (now > session.absoluteExpiresAt) {
    sessions.delete(sessionId);
    return { ok: false, reason: 'ABSOLUTE_EXPIRED' };
  }
  if (now - session.lastActivityAt > idleTimeoutMs) {
    sessions.delete(sessionId);
    return { ok: false, reason: 'IDLE_EXPIRED' };
  }
  return { ok: true, session };
}

export function idleExpiresAt(session: SessionRecord): number {
  return session.lastActivityAt + idleTimeoutMs;
}

/** True server-side invalidation (spec §5/§8: logout "invalidate session server-side... Không
 * chỉ xóa cookie ở browser"). */
export function revokeSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function revokeAllForUser(userId: string, exceptSessionId?: string): number {
  let count = 0;
  for (const [id, s] of sessions) {
    if (s.userId === userId && id !== exceptSessionId) {
      sessions.delete(id);
      count++;
    }
  }
  return count;
}

export function listSessionsForUser(userId: string): SessionRecord[] {
  return [...sessions.values()].filter((s) => s.userId === userId);
}

/** A short, non-reversible reference to a session for the `/api/auth/sessions` list — never
 * the real `sessionId` (spec §24: "Không expose raw session IDs"). Deterministic so the same
 * session always maps to the same display id within this process's lifetime, without needing a
 * second lookup table. */
export function toDisplayId(sessionId: string): string {
  return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}

export function findByDisplayId(userId: string, displayId: string): SessionRecord | undefined {
  return listSessionsForUser(userId).find((s) => toDisplayId(s.sessionId) === displayId);
}

// ---- Test-only helpers (server/test/security/*.test.ts) --------------------------------------

export function _debugSetLastActivity(sessionId: string, timestamp: number): void {
  const s = sessions.get(sessionId);
  if (s) s.lastActivityAt = timestamp;
}

export function _debugSetAbsoluteExpiry(sessionId: string, timestamp: number): void {
  const s = sessions.get(sessionId);
  if (s) s.absoluteExpiresAt = timestamp;
}

export function _debugClearAllSessions(): void {
  sessions.clear();
}

export function _debugSessionCount(): number {
  return sessions.size;
}
