// CSRF protection — double-submit token tied to the session record itself (stronger than a
// stateless double-submit: the token must match the *specific* session's own value, not just
// "some cookie named csrf_token"), per spec §20: "Không chỉ dựa vào SameSite."
//
// The token is issued in a non-HttpOnly cookie so frontend JS can read it and echo it back in
// an `X-CSRF-Token` header on state-changing requests — see src/app/core/interceptors/
// auth.interceptor.ts. It is NOT a secret in the same sense the session cookie is: its entire
// security value comes from being unreadable cross-origin (same-origin policy), which
// SameSite=Lax already mostly provides — this is deliberate defense-in-depth, not the only
// layer.
import { SessionRecord } from './types';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

export function validateCsrf(session: SessionRecord, headerToken: unknown): boolean {
  return typeof headerToken === 'string' && headerToken.length > 0 && headerToken === session.csrfToken;
}
