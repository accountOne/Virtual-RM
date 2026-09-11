// Login & Session Security upgrade — see docs/security/*.md. Canonical types for the new
// server-side auth/session layer. `Role` matches the role union already used everywhere else
// in this codebase (semantic/types.ts::SecurityContext, ai/types.ts::UserContext,
// core/services/auth.service.ts) — kept as a plain string union here too rather than importing
// across those modules, to avoid coupling auth/ to the semantic layer just for a type alias.
export type Role = 'MAKER' | 'CHECKER' | 'ADMIN';

export interface SessionRecord {
  sessionId: string;
  userId: string;
  companyId: string;
  role: Role;
  displayName: string;
  /** Double-submit CSRF token issued alongside this session — see auth/csrf.ts. */
  csrfToken: string;
  createdAt: number;
  lastActivityAt: number;
  /** Frozen at creation — never extended by activity or "continue session", per spec §6/§7:
   * absolute timeout is a hard ceiling. */
  absoluteExpiresAt: number;
  userAgent?: string;
  ip?: string;
}

/** What `/api/auth/sessions` exposes for a session — deliberately excludes `sessionId` and
 * `csrfToken` (spec §24: "Không expose raw session IDs"). */
export interface SessionSummary {
  id: string;
  isCurrent: boolean;
  userAgent?: string;
  createdAt: string;
  lastActivityAt: string;
}
