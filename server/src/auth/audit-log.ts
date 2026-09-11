// Security audit log — spec §25/§28. Appends masked, structured events to a JSONL file and
// keeps a bounded in-memory tail for tests/introspection. Best-effort: a logging failure must
// never break the request it's logging (see the try/catch in logSecurityEvent).
import fs from 'fs';
import path from 'path';

export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'PASSWORD_FAILED'
  | 'AUTHORIZATION_DENIED'
  | 'ACCESS_DENIED'
  | 'SUSPICIOUS_REQUEST'
  | 'TRANSACTION_CONFIRMATION'
  | 'TRANSACTION_SUBMIT'
  | 'TRANSACTION_REJECT'
  | 'LC_REQUEST_CREATED'
  | 'GUARANTEE_REQUEST_CREATED'
  | 'COLLECTION_REQUEST_CREATED';

export interface AuditEntry {
  ts: string;
  type: AuditEventType;
  [key: string]: unknown;
}

const LOG_DIR = path.join(__dirname, '..', '..', 'data');
const LOG_FILE = path.join(LOG_DIR, 'audit-log.jsonl');

function auditEnabled(): boolean {
  return process.env.AUDIT_ENABLED !== 'false';
}

// Field names that must never reach the log verbatim (spec §25: "password, OTP, PIN, CVV, full
// token, session secret, full account number nếu không cần thiết"). Matched case-insensitively
// against object keys anywhere in the details payload.
const SENSITIVE_KEY_PATTERN = /password|passwordhash|otp|pin|cvv|token|sessionid|secret/i;

function maskValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '***MASKED***';
  if (/account(no|number)/i.test(key) && typeof value === 'string') {
    return value.length > 4 ? `***${value.slice(-4)}` : '***';
  }
  return value;
}

function maskDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) out[k] = maskValue(k, v);
  return out;
}

const MEMORY_LOG_CAP = 5000;
const memoryLog: AuditEntry[] = [];

export function logSecurityEvent(type: AuditEventType, details: Record<string, unknown> = {}): void {
  if (!auditEnabled()) return;
  const entry: AuditEntry = { ts: new Date().toISOString(), type, ...maskDetails(details) };
  memoryLog.push(entry);
  if (memoryLog.length > MEMORY_LOG_CAP) memoryLog.shift();
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Never let audit logging break the request it's auditing.
  }
}

export function _debugReadMemoryLog(): readonly AuditEntry[] {
  return memoryLog;
}

export function _debugClearMemoryLog(): void {
  memoryLog.length = 0;
}
